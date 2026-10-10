import { defineConfig } from "vitest/config";
import { generatedFormPlugin } from "./src/__test-utils__/generated-form-plugin.js";

export default defineConfig({
  plugins: [generatedFormPlugin()],
  resolve: {
    // The virtual generated component and @ez-gform/react's dist must share
    // exactly one copy of React or hooks break.
    dedupe: ["react", "react-dom"],
  },
  test: {
    // Full ts.createProgram type-checks against real .d.ts output take
    // longer than Vitest's 5s default, especially the first run per file
    // and under parallel turbo load (observed 23-53s).
    testTimeout: 120000,
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 98,
        branches: 95,
        functions: 94,
        statements: 98,
      },
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/__test-utils__/**",
      ],
    },
  },
});
