import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test spawns a Node subprocess; allow headroom on a loaded machine.
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
