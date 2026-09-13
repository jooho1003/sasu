import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/evals/**/*.eval.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 240_000,
    hookTimeout: 30_000,
  },
});
