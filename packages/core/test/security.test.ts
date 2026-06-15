import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packagesRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("security regressions", () => {
  it("does not add blocked local auth paths or elevated sandbox defaults under packages", async () => {
    const files = await sourceFiles(packagesRoot);
    const content = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    const blockedPatterns = [
      new RegExp(`auth[.]json`, "u"),
      new RegExp(`[.]codex`, "u"),
      new RegExp(`creden${"tial"}`, "iu"),
      new RegExp(`danger-${"full"}-${"access"}`, "u")
    ];

    for (const pattern of blockedPatterns) {
      expect(pattern.test(content)).toBe(false);
    }
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "dist" && entry.name !== "node_modules") {
        return sourceFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    })
  );

  return files.flat();
}
