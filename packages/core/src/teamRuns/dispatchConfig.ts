import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";

export const teamRunDispatchConfigArtifactName = "team-run-dispatch.json";

export const TeamRunDispatchConfigSchema = z.object({
  version: z.literal(1),
  workers: z.object({
    codex: z.boolean(),
    claude: z.boolean()
  }),
  write: z.boolean().default(false),
  timeoutMs: z.number().int().positive().optional()
});

export type TeamRunDispatchConfig = z.infer<typeof TeamRunDispatchConfigSchema>;

export function createTeamRunDispatchConfig(input: {
  codex?: boolean;
  claude?: boolean;
  write?: boolean;
  timeoutMs?: number;
}): TeamRunDispatchConfig {
  const codex = input.codex === true;
  const claude = input.claude === true;
  return TeamRunDispatchConfigSchema.parse({
    version: 1,
    workers: {
      codex,
      claude
    },
    write: input.write === true && (codex || claude),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs })
  });
}

export function shouldPersistTeamRunDispatchConfig(config: TeamRunDispatchConfig): boolean {
  return config.workers.codex || config.workers.claude || config.write || config.timeoutMs !== undefined;
}

export async function writeTeamRunDispatchConfig(
  artifactStore: ArtifactStore,
  teamRunId: string,
  config: TeamRunDispatchConfig
): Promise<string> {
  const parsed = TeamRunDispatchConfigSchema.parse(config);
  return artifactStore.writeArtifact(teamRunId, teamRunDispatchConfigArtifactName, `${JSON.stringify(parsed, null, 2)}\n`);
}

export async function readTeamRunDispatchConfig(
  artifactStore: ArtifactStore,
  teamRunId: string
): Promise<TeamRunDispatchConfig | undefined> {
  const configPath = path.join(artifactStore.getRunDir(teamRunId), teamRunDispatchConfigArtifactName);
  let content: string;
  try {
    content = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid TeamRun dispatch config for ${teamRunId}: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return TeamRunDispatchConfigSchema.parse(value);
  } catch (error) {
    throw new Error(`Invalid TeamRun dispatch config for ${teamRunId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
