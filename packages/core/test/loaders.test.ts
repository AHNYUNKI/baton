import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadAgentProfiles, loadWorkflows } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("YAML loaders", () => {
  it("loads bundled agent and workflow examples", async () => {
    const agents = await loadAgentProfiles({ cwd: repoRoot });
    const workflows = await loadWorkflows({ cwd: repoRoot });

    expect(agents.map((agent) => agent.id)).toEqual(["analyst", "architect", "implementer"]);
    expect(workflows[0]?.id).toBe("default");
  });

  it("loads local YAML and lets local IDs override examples", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-loaders-"));
    const examplesDir = path.join(workspaceRoot, "examples", "agents");
    const localDir = path.join(workspaceRoot, ".baton", "agents");
    await mkdir(examplesDir, { recursive: true });
    await mkdir(localDir, { recursive: true });
    await writeFile(
      path.join(examplesDir, "implementer.agent.yaml"),
      "id: implementer\nrole: implementer\nname: Example\nprovider: codex\n",
      "utf8"
    );
    await writeFile(
      path.join(localDir, "implementer.agent.yaml"),
      "id: implementer\nrole: implementer\nname: Local\nprovider: codex\n",
      "utf8"
    );

    const agents = await loadAgentProfiles({ cwd: workspaceRoot });

    expect(agents).toHaveLength(1);
    expect(agents[0]?.name).toBe("Local");
  });

  it("includes file paths in validation errors", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-loaders-"));
    const examplesDir = path.join(workspaceRoot, "examples", "workflows");
    await mkdir(examplesDir, { recursive: true });
    const workflowPath = path.join(examplesDir, "bad.workflow.yaml");
    await writeFile(workflowPath, "id: bad\nname: Bad\nsteps: []\n", "utf8");

    await expect(loadWorkflows({ cwd: workspaceRoot })).rejects.toThrow(workflowPath);
  });
});
