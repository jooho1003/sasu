import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@sasu/contracts": fileURLToPath(new URL("../lib/contracts.ts", import.meta.url)),
      "@sasu/review-audio": fileURLToPath(new URL("../lib/adapters/review-audio.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/*.test.ts"],
  },
});
