import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are off, so RTL's automatic cleanup is not registered.
// Stubbed globals (fetch) are restored by each test file's own afterEach.
afterEach(() => {
  cleanup();
});
