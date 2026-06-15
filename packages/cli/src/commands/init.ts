import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { workspaceDir } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export async function initCommand(_args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const batonDir = workspaceDir(context.cwd);
  await mkdir(path.join(batonDir, "runs"), { recursive: true });
  await mkdir(path.join(batonDir, "agents"), { recursive: true });
  await mkdir(path.join(batonDir, "workflows"), { recursive: true });
  await writeConfigIfMissing(path.join(batonDir, "config.json"));
  context.stdout(`Initialized Baton workspace at ${batonDir}`);
  return 0;
}

async function writeConfigIfMissing(configPath: string): Promise<void> {
  try {
    await writeFile(configPath, `${JSON.stringify({ version: 1 }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
