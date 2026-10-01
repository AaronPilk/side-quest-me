import { defineConfig } from "vitest/config";

// Deliberately separate from normal tests: this command makes paid API calls.
export default defineConfig({
  test: {
    include: [
      "scripts/eval-quest-ai.live.ts",
      "scripts/eval-experience-discovery.live.ts",
    ],
    testTimeout: 100_000,
    fileParallelism: false,
    retry: 0,
  },
});
