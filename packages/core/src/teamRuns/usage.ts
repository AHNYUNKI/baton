import type { TeamRun, TeamRunRoleUsage } from "@baton/schemas";

import type { WorkerRunResult } from "../workers/WorkerAdapter.js";

export type RoleUsage = TeamRunRoleUsage;

export type UsagePlatformAggregate = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  roles: number;
};

export type UsageAggregate = {
  byPlatform: Record<string, UsagePlatformAggregate>;
  total: Omit<UsagePlatformAggregate, "roles">;
  anyEstimated: boolean;
};

export function estimateTokens(text: string): number {
  // Heuristic only: roughly estimate tokens from character count when providers do not report usage.
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}

export function readOrEstimateUsage(prompt: string, result: WorkerRunResult): RoleUsage {
  const measured = readMeasuredUsage(result.metadata?.usage);
  if (measured !== undefined) {
    return measured;
  }

  return {
    inputTokens: estimateTokens(prompt),
    outputTokens: estimateTokens(result.stdout),
    estimated: true
  };
}

export function aggregateTeamRunUsage(teamRun: TeamRun): UsageAggregate {
  const byPlatform: Record<string, UsagePlatformAggregate> = {};
  const total = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let anyEstimated = false;

  for (const role of teamRun.roles) {
    if (role.usage === undefined) {
      continue;
    }

    const platform = role.assignedAgentId;
    const aggregate = byPlatform[platform] ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, roles: 0 };
    const totalTokens = role.usage.inputTokens + role.usage.outputTokens;

    aggregate.inputTokens += role.usage.inputTokens;
    aggregate.outputTokens += role.usage.outputTokens;
    aggregate.totalTokens += totalTokens;
    aggregate.roles += 1;
    byPlatform[platform] = aggregate;

    total.inputTokens += role.usage.inputTokens;
    total.outputTokens += role.usage.outputTokens;
    total.totalTokens += totalTokens;
    anyEstimated ||= role.usage.estimated;
  }

  return { byPlatform, total, anyEstimated };
}

function readMeasuredUsage(value: unknown): RoleUsage | undefined {
  if (!isRecord(value) || !isTokenCount(value.inputTokens) || !isTokenCount(value.outputTokens)) {
    return undefined;
  }

  return {
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    estimated: false
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
