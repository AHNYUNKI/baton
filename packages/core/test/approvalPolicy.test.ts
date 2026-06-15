import { describe, expect, it } from "vitest";

import { ApprovalPolicy } from "../src/index.js";

describe("ApprovalPolicy", () => {
  it("requires approval for implement and fix by default", () => {
    const policy = new ApprovalPolicy();

    expect(policy.requiresApproval("implement")).toBe(true);
    expect(policy.requiresApproval("fix")).toBe(true);
    expect(policy.requiresApproval("analyze")).toBe(false);
  });

  it("accepts a custom approval set", () => {
    const policy = new ApprovalPolicy({ requiresApprovalFor: ["review"] });

    expect(policy.requiresApproval("review")).toBe(true);
    expect(policy.requiresApproval("implement")).toBe(false);
  });
});
