import type { WorkflowStepType } from "@baton/schemas";

export type ApprovalPolicyOptions = {
  requiresApprovalFor?: WorkflowStepType[];
};

export class ApprovalPolicy {
  private readonly requiredStepTypes: ReadonlySet<WorkflowStepType>;

  public constructor(options: ApprovalPolicyOptions = {}) {
    this.requiredStepTypes = new Set(options.requiresApprovalFor ?? ["implement", "fix"]);
  }

  public requiresApproval(stepType: WorkflowStepType): boolean {
    return this.requiredStepTypes.has(stepType);
  }
}
