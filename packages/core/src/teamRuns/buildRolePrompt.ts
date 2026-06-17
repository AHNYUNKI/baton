import type { Project, TeamPlan, TeamRole, TeamRunRole } from "@baton/schemas";

export type UpstreamContextEntry = {
  roleId: string;
  name: string;
  assignedAgentId: string;
  status: TeamRunRole["status"];
  summary?: string;
  artifacts: string[];
};

export type BuildRolePromptInput = {
  project: Project;
  role: TeamRole;
  teamPlan: TeamPlan;
  runDirectory: string;
  upstream?: UpstreamContextEntry[];
};

export function buildRolePrompt({ project, role, teamPlan, runDirectory, upstream = [] }: BuildRolePromptInput): string {
  const overview = project.overview?.trim() || "(없음)";
  const reportsTo = role.reportsTo ?? "(대표 직속)";
  const peerRoles = teamPlan.roles
    .map((candidate) => `- ${candidate.id}: ${candidate.name} (${candidate.assignedAgentId})`)
    .join("\n");
  const upstreamSection = renderUpstreamContext(upstream);

  return [
    "# Baton TeamRun Role Dispatch",
    "",
    "## Project",
    `- id: ${project.id}`,
    `- name: ${project.name}`,
    `- source: ${project.source.kind}:${project.source.value}`,
    `- overview: ${overview}`,
    "",
    "## Assigned Role",
    `- roleId: ${role.id}`,
    `- name: ${role.name}`,
    `- assignedAgentId: ${role.assignedAgentId}`,
    `- reportsTo: ${reportsTo}`,
    `- description: ${role.description}`,
    "",
    "## Role Instructions",
    role.instructions.trim() || "(역할 지침 없음)",
    "",
    "## Team Plan",
    peerRoles,
    ...upstreamSection,
    "",
    "## Artifacts",
    `작업 로그와 산출물은 Baton run directory 안에 작성해 주세요: ${runDirectory}`,
    "중간 산출물은 사람이 읽을 수 있는 파일 이름으로 남겨 주세요."
  ].join("\n");
}

function renderUpstreamContext(upstream: UpstreamContextEntry[]): string[] {
  if (upstream.length === 0) {
    return [];
  }

  const lines = ["", "## Upstream Context (대표가 전달한 이전 작업 결과)"];
  for (const entry of upstream) {
    const summary = entry.summary?.trim() || "(요약 없음)";
    lines.push(`- ${entry.name} (${entry.roleId}, ${entry.assignedAgentId}, 상태:${entry.status})`);
    lines.push(`  - summary: ${summary}`);
    if (entry.artifacts.length === 0) {
      lines.push("  - artifacts: (없음)");
      continue;
    }

    lines.push("  - artifacts:");
    for (const artifact of entry.artifacts) {
      lines.push(`    - ${artifact}`);
    }
  }

  return lines;
}
