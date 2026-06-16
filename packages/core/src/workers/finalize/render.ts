import type { Run, RunStep } from "@baton/schemas";

export type FinalizeSourceArtifact =
  | {
      name: string;
      exists: true;
      content: string;
    }
  | {
      name: string;
      exists: false;
    };

export type FinalizeRenderInput = {
  run: Run;
  sourceArtifacts: readonly FinalizeSourceArtifact[];
  generatedArtifacts: readonly string[];
};

const titleMaxLength = 80;

export function renderFinalSummary(input: FinalizeRenderInput): string {
  const run = input.run;
  return [
    "# Final Summary",
    "",
    "## Request",
    "",
    codeFence(run.request, "text"),
    "",
    "## Workflow",
    "",
    renderMarkdownTable(["Field", "Value"], workflowRows(run)),
    "",
    "## Steps",
    "",
    renderMarkdownTable(
      ["Step", "Type", "Status", "Reason", "Artifacts"],
      run.steps.map((step) => [step.id, step.type, step.status, step.reason ?? "-", renderStepArtifacts(step)])
    ),
    "",
    "## Test Summary",
    "",
    renderTestSummary(input.sourceArtifacts),
    "",
    "## Artifacts",
    "",
    renderArtifacts(input.sourceArtifacts, input.generatedArtifacts),
    "",
    "## Outcome",
    "",
    `- Run status at finalize: ${run.status}`,
    `- Terminal outcome: ${terminalOutcome(run)}`,
    ""
  ].join("\n");
}

export function renderPrDescription(input: FinalizeRenderInput): string {
  const run = input.run;
  const presentArtifacts = input.sourceArtifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.name);
  return [
    `# ${normalizePrTitle(run.request)}`,
    "",
    "## Summary",
    "",
    `- Request: ${singleLine(run.request)}`,
    `- Workflow: ${run.workflowId}`,
    `- Run status at finalize: ${run.status}`,
    `- Terminal outcome: ${terminalOutcome(run)}`,
    "",
    "## Step Overview",
    "",
    renderMarkdownTable(
      ["Step", "Type", "Status"],
      run.steps.map((step) => [step.id, step.type, step.status])
    ),
    "",
    "## Test Status",
    "",
    renderTestSummary(input.sourceArtifacts),
    "",
    "## Artifact Pointers",
    "",
    [...input.generatedArtifacts, ...presentArtifacts].map((artifact) => `- ${artifact}`).join("\n"),
    ""
  ].join("\n");
}

export function normalizePrTitle(request: string, maxLength = titleMaxLength): string {
  const normalized = singleLine(request).replace(/^#+\s*/u, "");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const prefixLength = Math.max(0, maxLength - 3);
  return `${normalized.slice(0, prefixLength).trimEnd()}...`;
}

function workflowRows(run: Run): string[][] {
  return [
    ["Run", run.id],
    ["Workflow", run.workflowId],
    ["Status", run.status],
    ["Dry run", String(run.dryRun)],
    ["Created", run.createdAt],
    ["Updated", run.updatedAt ?? "-"],
    ["Base branch", run.baseBranch ?? "-"],
    ["Worktree", run.worktreePath ?? "-"]
  ];
}

function renderStepArtifacts(step: RunStep): string {
  if (step.artifacts === undefined || step.artifacts.length === 0) {
    return "-";
  }

  return step.artifacts.map((artifact) => artifact.split(/[\\/]/u).at(-1) ?? artifact).join(", ");
}

function renderTestSummary(sourceArtifacts: readonly FinalizeSourceArtifact[]): string {
  const testResult = sourceArtifacts.find((artifact) => artifact.name === "test_result.md");
  if (testResult === undefined || !testResult.exists) {
    return "- test_result.md: not present.";
  }

  const rows = [
    ["Summary", extractField(testResult.content, "Summary") ?? "present"],
    ["Exit code", extractField(testResult.content, "Exit code") ?? "-"],
    ["Command", extractField(testResult.content, "Command") ?? "-"]
  ];
  return renderMarkdownTable(["Field", "Value"], rows);
}

function renderArtifacts(sourceArtifacts: readonly FinalizeSourceArtifact[], generatedArtifacts: readonly string[]): string {
  const presentArtifacts = sourceArtifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.name);
  return [
    "### Generated",
    "",
    generatedArtifacts.map((artifact) => `- ${artifact}`).join("\n"),
    "",
    "### Source",
    "",
    `Present source artifacts: ${presentArtifacts.length === 0 ? "(none)" : presentArtifacts.join(", ")}`,
    "",
    renderMarkdownTable(
      ["Artifact", "Status"],
      sourceArtifacts.map((artifact) => [artifact.name, artifact.exists ? "present" : "not present"])
    )
  ].join("\n");
}

function terminalOutcome(run: Run): string {
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return run.status;
  }

  return `pending (${run.status})`;
}

function extractField(content: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = content.match(new RegExp(`^[-*]?\\s*${escapedField}:\\s*(.+)$`, "imu"));
  return match?.[1]?.trim();
}

function renderMarkdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${headers.map(escapeMarkdownTableCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(" | ")} |`)
  ].join("\n");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/gu, "<br>");
}

function codeFence(content: string, language: string): string {
  const longestBacktickRun = Math.max(2, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = "`".repeat(longestBacktickRun + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}

function singleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
