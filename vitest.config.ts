import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: {
    alias: {
      "@edu/contracts": resolve("shared/contracts.ts"),
      "@edu/database": resolve("projects/database/src/index.ts"),
    },
  },
  test: {
    include: ["tests/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
