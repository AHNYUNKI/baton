import type { ProcessRunner } from "@baton/core";

export type WriteLine = (message: string) => void;

export type CommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: WriteLine;
  stderr: WriteLine;
  runner: ProcessRunner;
};

export type CommandResult = number;
