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
    "중간 산출물은 사람이 읽을 수 있는 파일 이름으로 남겨 주세요.",
    "",
    "## 학습 설명 (필수)",
    "작업 출력 맨 끝에 반드시 `## 학습 설명` 헤딩으로 초보 개발자용 한국어 설명을 붙여 주세요.",
    "다음 항목을 포함해 주세요:",
    "- 무엇을 했나: 이번 역할에서 수행한 일을 구체적으로 요약합니다.",
    "- 왜 이렇게 했나(결정 근거): 중요한 선택의 이유를 설명합니다.",
    "- 핵심 개념: 이해해야 할 개념을 초보 개발자 눈높이로 설명합니다.",
    "- 대안과 트레이드오프: 고려할 수 있는 다른 방법과 장단점을 짚습니다."
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
