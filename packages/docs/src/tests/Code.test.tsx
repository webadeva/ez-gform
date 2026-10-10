import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Code } from "../components/Code";

describe("Code", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn(() => {
      return Promise.resolve();
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the code and prefers filename over language as the label", () => {
    render(
      <Code language="tsx" filename="App.tsx">
        {"const a = 1;"}
      </Code>,
    );
    expect(screen.getByText("App.tsx")).toBeDefined();
    expect(screen.queryByText("tsx")).toBeNull();
    expect(screen.getByText("const a = 1;")).toBeDefined();
  });

  it("falls back to language, then to 'code'", () => {
    const { unmount } = render(<Code language="sh">{"ls"}</Code>);
    expect(screen.getByText("sh")).toBeDefined();
    unmount();
    render(<Code>{"ls"}</Code>);
    expect(screen.getByText("code")).toBeDefined();
  });

  it("copies the code, shows Copied, then resets after 1500ms", async () => {
    render(<Code>{"npm i x"}</Code>);
    await act(async () => {
      screen.getByRole("button", { name: "Copy" }).click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith("npm i x");
    expect(screen.getByRole("button", { name: "Copied" })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });

  it("shows Copy failed when the clipboard write rejects, then resets after 1500ms", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<Code>{"x"}</Code>);
    await act(async () => {
      screen.getByRole("button", { name: "Copy" }).click();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeDefined();
  });
});
