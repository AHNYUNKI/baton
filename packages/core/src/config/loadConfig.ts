import { readFile } from "node:fs/promises";
import path from "node:path";

import { BatonConfigSchema, type BatonConfig } from "@baton/schemas";
import { ZodError } from "zod";

import { workspaceDir } from "./paths.js";

export async function loadConfig(cwd: string = process.cwd()): Promise<BatonConfig> {
  const configPath = path.join(workspaceDir(cwd), "config.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { version: 1 };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid Baton config JSON at ${configPath}: ${error.message}`);
    }
    throw error;
  }

  try {
    return BatonConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Invalid Baton config at ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
