import { z } from "zod";
import { TeamPlanSchema, assertPlanAgents, type Project, type TeamPlan } from "@baton/schemas";

import type { WorkerAdapter, WorkerRunResult } from "../workers/WorkerAdapter.js";

export const defaultTeamPlanMaxAttempts = 2;
export const maxTeamPlanAttemptsLimit = 5;

export type BuildPlanPromptInput = {
  projectName?: string;
  overview: string;
  agentIds: readonly string[];
  previousError?: string;
};

export type GenerateTeamPlanInput = {
  project: Project;
  overview: string;
  leadAdapter: WorkerAdapter;
  maxAttempts?: number;
  timeoutMs?: number;
};

export class PlanGenerationError extends Error {
  public readonly attempts: number;

  public constructor(message: string, attempts: number) {
    super(message);
    this.name = "PlanGenerationError";
    this.attempts = attempts;
  }
}

export function buildPlanPrompt(input: BuildPlanPromptInput): string {
  const projectLine = input.projectName === undefined ? "Project: (unnamed)" : `Project: ${input.projectName}`;
  const agentList = input.agentIds.map((agentId) => `- ${agentId}`).join("\n");
  const correction = input.previousError === undefined ? "" : `\nPrevious output was invalid. Fix only the JSON. Error:\n${input.previousError}\n`;

  return [
    "You are the lead AI for a local-first Baton project.",
    projectLine,
    "",
    "Create a TeamPlan from the project overview.",
    "",
    "Project overview:",
    input.overview,
    "",
    "Available assignedAgentId values:",
    agentList,
    correction,
    "Return only one strict JSON object with this shape:",
    JSON.stringify(
      {
        roles: [
          {
            id: "string-non-empty-unique",
            name: "string-non-empty",
            description: "string",
            assignedAgentId: input.agentIds[0] ?? "codex",
            instructions: "string",
            reportsTo: null
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules:",
    "- roles must be a non-empty array.",
    "- role ids must be stable, lowercase, and unique within the plan.",
    "- Write role name, description, and instructions in Korean (한국어).",
    "- role ids must remain short English slugs, for example analysis-design.",
    "- assignedAgentId values must be copied exactly from the available values.",
    "- assignedAgentId must be one of the available values.",
    "- 2~3단계 계층을 만들고 전부 평면인 조직은 지양하세요.",
    "- 일부 역할은 대표 직속 매니저로 두고 reportsTo를 null로 설정하세요.",
    "- 나머지 역할은 존재하는 매니저 role id로 reportsTo를 설정하세요.",
    "- reportsTo must be an existing role id or null, and reportsTo cycles are not allowed.",
    "- Do not include markdown, prose, comments, or trailing commas."
  ].join("\n");
}

export function extractJson(stdout: string): unknown {
  const fenced = fencedJsonCandidates(stdout);
  for (const candidate of fenced) {
    const parsed = parseJson(candidate);
    if (parsed.success) {
      return parsed.value;
    }
  }

  for (const candidate of balancedObjectCandidates(stdout)) {
    const parsed = parseJson(candidate);
    if (parsed.success) {
      return parsed.value;
    }
  }

  throw new Error("No valid JSON object found in lead output.");
}

export async function generateTeamPlan(input: GenerateTeamPlanInput): Promise<TeamPlan> {
  const maxAttempts = input.maxAttempts ?? defaultTeamPlanMaxAttempts;
  validateMaxAttempts(maxAttempts);

  let lastError = "No generation attempt completed.";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = buildPlanPrompt({
      projectName: input.project.name,
      overview: input.overview,
      agentIds: input.project.agentIds,
      ...(attempt === 1 ? {} : { previousError: lastError })
    });
    const result = await input.leadAdapter.run({
      cwd: projectCwd(input.project),
      prompt,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      metadata: {
        projectId: input.project.id,
        stepId: "team-plan",
        stepType: "analyze",
        attempt
      }
    });

    const validation = parsePlanFromResult(result, input.project);
    if (validation.success) {
      return validation.plan;
    }
    lastError = validation.error;
  }

  throw new PlanGenerationError(`Failed to generate a valid TeamPlan after ${maxAttempts} attempt(s): ${lastError}`, maxAttempts);
}

export function clampAssignedAgents(plan: TeamPlan, agentIds: readonly string[], preferredFallback?: string): TeamPlan {
  if (agentIds.length === 0) {
    throw new Error("Cannot clamp TeamPlan assignedAgentId values without project.agentIds.");
  }

  const firstAgentId = agentIds[0];
  if (firstAgentId === undefined) {
    throw new Error("Cannot clamp TeamPlan assignedAgentId values without project.agentIds.");
  }

  const allowedAgentIds = new Set(agentIds);
  const fallback = preferredFallback !== undefined && allowedAgentIds.has(preferredFallback) ? preferredFallback : firstAgentId;
  const clamped = {
    roles: plan.roles.map((role) => ({
      ...role,
      assignedAgentId: allowedAgentIds.has(role.assignedAgentId) ? role.assignedAgentId : fallback
    }))
  };
  assertPlanAgents(clamped, agentIds);
  return clamped;
}

export function normalizeHierarchy(plan: TeamPlan): TeamPlan {
  const roleIds = new Set(plan.roles.map((role) => role.id));
  const validParentByRoleId = new Map<string, string>();
  for (const role of plan.roles) {
    const reportsTo = normalizedReportsTo(role.reportsTo);
    if (reportsTo !== undefined && reportsTo !== null && reportsTo !== role.id && roleIds.has(reportsTo)) {
      validParentByRoleId.set(role.id, reportsTo);
    }
  }

  const cyclicRoleIds = findCyclicRoleIds(validParentByRoleId);
  return {
    roles: plan.roles.map((role) => {
      const reportsTo = normalizedReportsTo(role.reportsTo);
      if (reportsTo === null) {
        return { ...role, reportsTo };
      }
      if (reportsTo === undefined || reportsTo === role.id || !roleIds.has(reportsTo) || cyclicRoleIds.has(role.id)) {
        return withoutReportsTo(role);
      }
      return { ...role, reportsTo };
    })
  };
}

function parsePlanFromResult(result: WorkerRunResult, project: Project): { success: true; plan: TeamPlan } | { success: false; error: string } {
  if (!result.success) {
    const reason = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode ?? "unknown"}`;
    return { success: false, error: `Lead adapter failed: ${reason}` };
  }

  try {
    const json = extractJson(result.stdout);
    const parsed = TeamPlanSchema.safeParse(json);
    if (!parsed.success) {
      return { success: false, error: formatError(parsed.error) };
    }
    return {
      success: true,
      plan: normalizeHierarchy(clampAssignedAgents(parsed.data, project.agentIds, project.leadAgentId))
    };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

function validateMaxAttempts(maxAttempts: number): void {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > maxTeamPlanAttemptsLimit) {
    throw new Error(`maxAttempts must be an integer between 1 and ${maxTeamPlanAttemptsLimit}.`);
  }
}

function projectCwd(project: Project): string {
  return project.source.kind === "local" ? project.source.value : process.cwd();
}

function fencedJsonCandidates(stdout: string): string[] {
  const candidates: string[] = [];
  const pattern = /```(?:json)?\s*([\s\S]*?)```/giu;
  let match: RegExpExecArray | null = pattern.exec(stdout);
  while (match !== null) {
    const candidate = match[1];
    if (candidate !== undefined) {
      candidates.push(candidate.trim());
    }
    match = pattern.exec(stdout);
  }
  return candidates;
}

function balancedObjectCandidates(stdout: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < stdout.length; start += 1) {
    if (stdout[start] !== "{") {
      continue;
    }

    const end = findBalancedObjectEnd(stdout, start);
    if (end !== undefined) {
      candidates.push(stdout.slice(start, end + 1));
      start = end;
    }
  }
  return candidates;
}

function findBalancedObjectEnd(value: string, start: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function parseJson(candidate: string): { success: true; value: unknown } | { success: false } {
  try {
    return { success: true, value: JSON.parse(candidate) };
  } catch {
    return { success: false };
  }
}

function normalizedReportsTo(reportsTo: TeamPlan["roles"][number]["reportsTo"]): string | null | undefined {
  if (reportsTo === null || reportsTo === undefined) {
    return reportsTo;
  }
  const trimmed = reportsTo.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function withoutReportsTo(role: TeamPlan["roles"][number]): TeamPlan["roles"][number] {
  const { reportsTo: _reportsTo, ...rest } = role;
  return rest;
}

function findCyclicRoleIds(parentByRoleId: ReadonlyMap<string, string>): Set<string> {
  const cyclic = new Set<string>();
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  const visit = (roleId: string): void => {
    if (visited.has(roleId)) {
      return;
    }
    if (visiting.has(roleId)) {
      const cycleStart = stack.indexOf(roleId);
      if (cycleStart >= 0) {
        for (const cyclicRoleId of stack.slice(cycleStart)) {
          cyclic.add(cyclicRoleId);
        }
      }
      return;
    }

    visiting.add(roleId);
    stack.push(roleId);
    const parentId = parentByRoleId.get(roleId);
    if (parentId !== undefined) {
      visit(parentId);
    }
    stack.pop();
    visiting.delete(roleId);
    visited.add(roleId);
  };

  for (const roleId of parentByRoleId.keys()) {
    visit(roleId);
  }
  return cyclic;
}

function formatError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "teamPlan"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}
