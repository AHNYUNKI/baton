import type { WorkflowStepType } from "@baton/schemas";

export const defaultMaxFixAttempts = 1;
export const maxFixAttemptsLimit = 5;
export const defaultFixableStepTypes: readonly WorkflowStepType[] = ["test"];

export type FixPolicyOptions = {
  maxAttempts?: number;
  fixableStepTypes?: readonly WorkflowStepType[];
};

export class FixPolicy {
  public readonly maxAttempts: number;
  public readonly fixableStepTypes: readonly WorkflowStepType[];

  private readonly fixableStepTypeSet: ReadonlySet<WorkflowStepType>;

  public constructor(options: FixPolicyOptions = {}) {
    const maxAttempts = options.maxAttempts ?? defaultMaxFixAttempts;
    validateMaxAttempts(maxAttempts);

    this.maxAttempts = maxAttempts;
    this.fixableStepTypes = options.fixableStepTypes ?? defaultFixableStepTypes;
    this.fixableStepTypeSet = new Set(this.fixableStepTypes);
  }

  public isFixable(stepType: WorkflowStepType): boolean {
    return this.fixableStepTypeSet.has(stepType);
  }
}

export function validateMaxAttempts(maxAttempts: number): void {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > maxFixAttemptsLimit) {
    throw new Error(`maxFixAttempts must be an integer between 1 and ${maxFixAttemptsLimit}.`);
  }
}
