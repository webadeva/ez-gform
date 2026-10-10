import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test spawns a Node subprocess; allow headroom on a loaded machine.
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // src/cli.ts is the bin entry; it is exercised by the subprocess tests
      // (cli.test.ts), which v8 coverage cannot see inside child processes.
      exclude: ["src/**/*.test.ts", "src/tests/**", "src/cli.ts"],
      // Remaining gaps are defensive branches no input can reach (version
      // fallback "0.0.0", non-Error rethrow guards, String(error) on
      // readFile/JSON.parse failures).
      thresholds: {
        lines: 100,
        branches: 96,
        functions: 100,
        statements: 100,
      },
    },
  },
});
