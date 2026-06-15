import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { AgentProfileSchema, type AgentProfile } from "@baton/schemas";

export type LoadAgentProfilesOptions = {
  cwd?: string;
  examplesDir?: string;
  localDir?: string;
};

export async function loadAgentProfiles(options: LoadAgentProfilesOptions = {}): Promise<AgentProfile[]> {
  const cwd = options.cwd ?? process.cwd();
  const examplesDir = options.examplesDir ?? path.join(cwd, "examples", "agents");
  const localDir = options.localDir ?? path.join(cwd, ".baton", "agents");
  const profiles = [
    ...(await loadAgentProfileDir(examplesDir, true)),
    ...(await loadAgentProfileDir(localDir, false))
  ];

  return mergeAgentProfiles(profiles);
}

async function loadAgentProfileDir(directory: string, required: boolean): Promise<AgentProfile[]> {
  const files = await yamlFiles(directory, required);
  const profiles: AgentProfile[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    try {
      const parsed = parse(content);
      profiles.push(AgentProfileSchema.parse(parsed));
    } catch (error) {
      throw new Error(`Failed to load agent profile ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return profiles;
}

async function yamlFiles(directory: string, required: boolean): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(ya?ml)$/u.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (!required && isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw new Error(`Failed to read agent profile directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeAgentProfiles(profiles: AgentProfile[]): AgentProfile[] {
  const byId = new Map<string, AgentProfile>();

  for (const profile of profiles) {
    byId.set(profile.id, profile);
  }

  return [...byId.values()];
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
