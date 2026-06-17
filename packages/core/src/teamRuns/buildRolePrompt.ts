import type { Project, TeamPlan, TeamRole } from "@baton/schemas";

export type BuildRolePromptInput = {
  project: Project;
  role: TeamRole;
  teamPlan: TeamPlan;
  runDirectory: string;
};

export function buildRolePrompt({ project, role, teamPlan, runDirectory }: BuildRolePromptInput): string {
  const overview = project.overview?.trim() || "(없음)";
  const reportsTo = role.reportsTo ?? "(대표 직속)";
  const peerRoles = teamPlan.roles
    .map((candidate) => `- ${candidate.id}: ${candidate.name} (${candidate.assignedAgentId})`)
    .join("\n");

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
    "",
    "## Artifacts",
    `작업 로그와 산출물은 Baton run directory 안에 작성해 주세요: ${runDirectory}`,
    "중간 산출물은 사람이 읽을 수 있는 파일 이름으로 남겨 주세요."
  ].join("\n");
}
