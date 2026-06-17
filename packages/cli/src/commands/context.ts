import type { Clock, ProcessRunner } from "@baton/core";

export type WriteLine = (message: string) => void;

export type CommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: WriteLine;
  stderr: WriteLine;
  runner: ProcessRunner;
  clock: Clock;
  readStdin?: () => Promise<string>;
};

export type CommandResult = number;
