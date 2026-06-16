import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadConfig, workspaceDir } from "@baton/core";
import { BatonConfigSchema, type BatonConfig } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";

const gettablePaths = new Set([
  "version",
  "obsidian",
  "obsidian.vault",
  "test",
  "test.command",
  "workers",
  "workers.codex",
  "workers.claude",
  "workers.test",
  "workers.fix",
  "workers.maxFixAttempts"
]);

const settablePaths = new Set([
  "version",
  "obsidian.vault",
  "test.command",
  "workers.codex",
  "workers.claude",
  "workers.test",
  "workers.fix",
  "workers.maxFixAttempts"
]);

export async function configCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(configUsage());
    return args.length === 0 ? 1 : 0;
  }

  const [command, ...rest] = args;
  switch (command) {
    case "list":
      return configListCommand(rest, context);
    case "get":
      return configGetCommand(rest, context);
    case "set":
      return configSetCommand(rest, context);
    default:
      context.stderr(configUsage());
      return 1;
  }
}

async function configListCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 0) {
    context.stderr(configUsage());
    return 1;
  }

  context.stdout(JSON.stringify(await loadConfig(context.cwd), null, 2));
  return 0;
}

async function configGetCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(configUsage());
    return 1;
  }

  const key = args[0];
  if (!gettablePaths.has(key)) {
    context.stderr(`Unknown Baton config key: ${key}`);
    return 1;
  }

  const result = getAtPath(await loadConfig(context.cwd), key);
  if (!result.found) {
    context.stderr(`Baton config key is not set: ${key}`);
    return 1;
  }

  context.stdout(formatConfigValue(result.value));
  return 0;
}

async function configSetCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 2 || args[0] === undefined || args[1] === undefined) {
    context.stderr(configUsage());
    return 1;
  }

  const [key, rawValue] = args;
  if (!settablePaths.has(key)) {
    context.stderr(`Unknown Baton config key: ${key}`);
    return 1;
  }

  const current = await loadConfig(context.cwd);
  const next = cloneConfig(current);
  setAtPath(next, key, coerceConfigValue(rawValue));
  const parsed = BatonConfigSchema.safeParse(next);
  if (!parsed.success) {
    throw new Error(`Invalid Baton config value for ${key}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  const configPath = path.join(workspaceDir(context.cwd), "config.json");
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
  context.stdout(`Set ${key}.`);
  return 0;
}

function cloneConfig(config: BatonConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function getAtPath(config: BatonConfig, key: string): { found: boolean; value?: unknown } {
  let value: unknown = config;
  for (const part of key.split(".")) {
    if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, part)) {
      return { found: false };
    }
    value = value[part];
  }

  return { found: true, value };
}

function setAtPath(config: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let target = config;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (next === undefined) {
      target[part] = {};
    } else if (!isRecord(next)) {
      throw new Error(`Cannot set Baton config key through non-object path: ${key}`);
    }
    target = target[part] as Record<string, unknown>;
  }

  const leaf = parts.at(-1);
  if (leaf === undefined) {
    throw new Error(`Invalid Baton config key: ${key}`);
  }
  target[leaf] = value;
}

function coerceConfigValue(rawValue: string): unknown {
  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  if (/^-?(0|[1-9]\d*)$/u.test(rawValue)) {
    const parsed = Number(rawValue);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  if (rawValue.trimStart().startsWith("[")) {
    try {
      return JSON.parse(rawValue) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON array value: ${rawValue}`);
      }
      throw error;
    }
  }

  return rawValue;
}

function formatConfigValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configUsage(): string {
  return [
    "Usage:",
    "  baton config list",
    "  baton config get <dotted.key>",
    "  baton config set <dotted.key> <value>"
  ].join("\n");
}
