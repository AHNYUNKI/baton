import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: {
      "@baton/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@baton/schemas": fileURLToPath(new URL("./packages/schemas/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
    restoreMocks: true
  }
});
