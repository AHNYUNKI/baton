import type { JournalNoteMeta, Run } from "@baton/schemas";

export type JournalNoteRenderInput = {
  run: Run;
  meta: JournalNoteMeta;
  safeRunId: string;
  copiedArtifacts: readonly string[];
  embeddedArtifacts: readonly string[];
};

export type JournalIndexEntry = {
  runId: string;
  safeRunId: string;
  status: string;
  dryRun: boolean;
  workflow: string;
  createdAt: string;
  outcome: string;
};

export function renderJournalNote(input: JournalNoteRenderInput): string {
  const workers = Object.entries(input.meta.workers).sort(([left], [right]) => left.localeCompare(right));

  return [
    "---",
    renderFrontmatter(input.meta),
    "---",
    "",
    `# Baton Run: ${input.safeRunId}`,
    "",
    "## Summary",
    "",
    renderMarkdownTable(
      ["Field", "Value"],
      [
        ["Run", input.safeRunId],
        ["Status", input.meta.status],
        ["Workflow", input.meta.workflow],
        ["Created", input.meta.createdAt],
        ["Updated", input.meta.updatedAt ?? ""],
        ["Dry run", String(input.meta.dryRun)],
        ["Outcome", input.meta.outcome ?? ""]
      ]
    ),
    "",
    "## Request",
    "",
    renderCodeFence(input.run.request, "text"),
    "",
    "## Steps",
    "",
    renderMarkdownTable(
      ["Step", "Type", "Status"],
      input.run.steps.map((step) => [step.id, step.type, step.status])
    ),
    "",
    "## Workers",
    "",
    renderMarkdownTable(
      ["Role", "Worker"],
      workers.map(([role, worker]) => [role, worker])
    ),
    "",
    "## Outcome",
    "",
    input.meta.outcome ?? input.meta.status,
    "",
    "## Artifacts",
    "",
    renderArtifactList(input.safeRunId, input.copiedArtifacts),
    "",
    "## Embedded Artifacts",
    "",
    renderEmbedList(input.safeRunId, input.embeddedArtifacts),
    ""
  ].join("\n");
}

export function renderJournalIndex(entries: readonly JournalIndexEntry[]): string {
  return [
    "# Baton Runs",
    "",
    "```dataview",
    "TABLE status, dryRun, workflow, createdAt, outcome",
    "FROM \"Baton/Runs\"",
    "WHERE runId",
    "SORT createdAt DESC",
    "```",
    "",
    "## All Runs",
    "",
    renderMarkdownTable(
      ["Run", "Status", "Workflow", "Created", "Dry Run", "Outcome"],
      entries.map((entry) => [
        `[[Baton/Runs/${entry.safeRunId}]]`,
        entry.status,
        entry.workflow,
        entry.createdAt,
        String(entry.dryRun),
        entry.outcome
      ])
    ),
    ""
  ].join("\n");
}

export function renderFrontmatter(meta: JournalNoteMeta): string {
  return [
    renderYamlScalar("runId", meta.runId),
    renderYamlScalar("status", meta.status),
    renderYamlScalar("dryRun", meta.dryRun),
    renderYamlScalar("workflow", meta.workflow),
    renderYamlScalar("createdAt", meta.createdAt),
    ...(meta.updatedAt === undefined ? [] : [renderYamlScalar("updatedAt", meta.updatedAt)]),
    ...(meta.outcome === undefined ? [] : [renderYamlScalar("outcome", meta.outcome)]),
    renderYamlList("roles", meta.roles),
    renderYamlRecord("workers", meta.workers),
    renderYamlScalar("stepCount", meta.stepCount),
    renderYamlList("tags", meta.tags)
  ].join("\n");
}

function renderYamlScalar(key: string, value: string | number | boolean): string {
  return `${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`;
}

function renderYamlList(key: string, values: readonly string[]): string {
  if (values.length === 0) {
    return `${key}: []`;
  }

  return [`${key}:`, ...values.map((value) => `  - ${JSON.stringify(value)}`)].join("\n");
}

function renderYamlRecord(key: string, values: Record<string, string>): string {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return `${key}: {}`;
  }

  return [`${key}:`, ...entries.map(([recordKey, value]) => `  ${JSON.stringify(recordKey)}: ${JSON.stringify(value)}`)].join("\n");
}

function renderArtifactList(safeRunId: string, artifacts: readonly string[]): string {
  if (artifacts.length === 0) {
    return "- No copied artifacts.";
  }

  return artifacts.map((artifact) => `- [[${safeRunId}/${artifact}|${artifact}]]`).join("\n");
}

function renderEmbedList(safeRunId: string, artifacts: readonly string[]): string {
  if (artifacts.length === 0) {
    return "- No embedded artifacts.";
  }

  return artifacts.map((artifact) => `![[${safeRunId}/${artifact}]]`).join("\n\n");
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

function renderCodeFence(content: string, language: string): string {
  const longestBacktickRun = Math.max(2, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = "`".repeat(longestBacktickRun + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}
