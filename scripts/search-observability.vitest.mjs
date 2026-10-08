import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Explicit alias avoids a workspace-wide tsconfig discovery scan on this Windows tree.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], exclude: ["tests/rls/**", "tests/e2e/**", "node_modules/**"], maxWorkers: 2 },
});
