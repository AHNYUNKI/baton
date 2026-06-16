import { homedir } from "node:os";
import path from "node:path";

export type PathEnvironment = {
  BATON_HOME?: string;
  HOME?: string;
};

export function batonHome(env: PathEnvironment = process.env): string {
  if (env.BATON_HOME && env.BATON_HOME.trim().length > 0) {
    return path.resolve(env.BATON_HOME);
  }

  return path.join(homedir(), ".baton");
}

export function workspaceDir(cwd: string = process.cwd()): string {
  return path.join(path.resolve(cwd), ".baton");
}

export function batonDbPath(cwd: string = process.cwd()): string {
  return path.join(workspaceDir(cwd), "baton.db");
}

export function runsDir(cwd: string = process.cwd()): string {
  return path.join(workspaceDir(cwd), "runs");
}

export function runDir(runId: string, cwd: string = process.cwd()): string {
  return path.join(runsDir(cwd), runId);
}
