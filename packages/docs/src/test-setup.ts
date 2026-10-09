import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jest-dom's own vitest augmentation declares Assertion<T>, which no longer matches vitest 5's
// Assertion<R, T>, so the matcher types are attached through Matchers<R, T> instead.
declare module "vitest" {
  interface Matchers<R extends void | Promise<void>, T>
    extends TestingLibraryMatchers<unknown, R>, Record<never, T> {}
}

let blockedCalls: string[] = [];

beforeEach(() => {
  blockedCalls = [];
  // Network guard: tests that expect a submit must override with their own vi.stubGlobal("fetch", ...).
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      blockedCalls.push(String(input));
      return Promise.reject(
        new Error("network access is not allowed in unit tests"),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (blockedCalls.length > 0) {
    const calls = blockedCalls.join(", ");
    blockedCalls = [];
    throw new Error(`network access is not allowed in unit tests: ${calls}`);
  }
});
