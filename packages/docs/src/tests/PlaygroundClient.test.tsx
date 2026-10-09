import {
  generateHtmlForm,
  generateReactComponent,
  generateSchemaJson,
  generateTypes,
} from "@ez-gform/codegen";
import { parseFormData } from "@ez-gform/core";
import type { FormSchema } from "@ez-gform/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import allQuestionTypes from "../app/playground/all-question-types.fixture.json";
import PlaygroundPage, { metadata } from "../app/playground/page";
import { PlaygroundClient } from "../app/playground/PlaygroundClient";

const schema: FormSchema = parseFormData(allQuestionTypes);

const generated = {
  json: generateSchemaJson(schema),
  types: generateTypes(schema),
  react: generateReactComponent(schema),
  html: generateHtmlForm(schema),
};

const stubFetch = (impl: () => Promise<unknown>) => {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const okResponse = (body: unknown, status = 200) => {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => {
      return Promise.resolve(body);
    },
  });
};

const codeText = (container: HTMLElement) => {
  return container.querySelector("pre code")?.textContent;
};

const filename = (container: HTMLElement) => {
  return container.querySelector(".code-block-header span")?.textContent;
};

const loadExample = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Load example" }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaygroundClient loading from a URL", () => {
  it("shows an error and does not fetch for empty input", async () => {
    const fetchMock = stubFetch(() => {
      return okResponse({});
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Enter a Google Form URL or id first.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats whitespace-only input as empty", async () => {
    const fetchMock = stubFetch(() => {
      return okResponse({});
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "   ");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/schema with the encoded trimmed input and renders the schema", async () => {
    const fetchMock = stubFetch(() => {
      return okResponse({ schema });
    });
    const user = userEvent.setup();
    const { container } = render(<PlaygroundClient />);
    const raw = "https://docs.google.com/forms/d/e/abc/viewform?x=1";
    await user.type(screen.getByLabelText("Google Form URL or id"), ` ${raw} `);
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect(
      await screen.findByRole("heading", { name: "Generated output" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/schema?formId=${encodeURIComponent(raw)}`,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(codeText(container)).toBe(generated.json);
  });

  it("submits on Enter in the input", async () => {
    const fetchMock = stubFetch(() => {
      return okResponse({ schema });
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(
      screen.getByLabelText("Google Form URL or id"),
      "form-id{Enter}",
    );
    await screen.findByRole("heading", { name: "Live form" });
    expect(fetchMock).toHaveBeenCalledWith("/api/schema?formId=form-id");
  });

  it("shows the body error message for a non-ok response", async () => {
    stubFetch(() => {
      return okResponse({ error: "Form is private" }, 403);
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Form is private",
    );
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows 'Request failed (status)' when a non-ok body has no error", async () => {
    stubFetch(() => {
      return okResponse({}, 502);
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Request failed (502)",
    );
  });

  it("shows the error when an ok body contains error", async () => {
    stubFetch(() => {
      return okResponse({ error: "Parse failed" }, 200);
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Parse failed",
    );
  });

  it("shows the thrown Error message when fetch rejects", async () => {
    stubFetch(() => {
      return Promise.reject(new Error("boom"));
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
  });

  it("clears a previously loaded schema when a later load fails", async () => {
    const responses = [
      okResponse({ schema }),
      okResponse({ error: "gone" }, 404),
    ];
    stubFetch(() => {
      return responses.shift() ?? okResponse({});
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    await screen.findByRole("tablist");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect((await screen.findByRole("alert")).textContent).toContain("gone");
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows Loading… and disables the button while pending", async () => {
    let resolve: (value: unknown) => void = () => {
      return undefined;
    };
    const pending = new Promise((r) => {
      resolve = r;
    });
    stubFetch(() => {
      return pending;
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.type(screen.getByLabelText("Google Form URL or id"), "x");
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    const button = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Loading…",
    });
    expect(button.disabled).toBe(true);
    resolve({
      ok: true,
      status: 200,
      json: () => {
        return Promise.resolve({ schema });
      },
    });
    const reloaded = await screen.findByRole<HTMLButtonElement>("button", {
      name: "Load schema",
    });
    expect(reloaded.disabled).toBe(false);
  });
});

describe("PlaygroundClient empty state", () => {
  it("shows the placeholder before anything is loaded", () => {
    render(<PlaygroundClient />);
    expect(screen.getByText(/entry ids and generated code/)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("PlaygroundClient example", () => {
  it("loads the bundled fixture offline and sets the input to the form id", async () => {
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await loadExample(user);
    expect(
      screen.getByLabelText<HTMLInputElement>("Google Form URL or id").value,
    ).toBe(schema.formId);
    expect(screen.getByRole("heading", { name: "Live form" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: /submit to google form/i }),
    ).toBeTruthy();
  });

  it("clears an earlier error", async () => {
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await user.click(screen.getByRole("button", { name: "Load schema" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    await loadExample(user);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("PlaygroundClient code tabs", () => {
  it("renders four tabs with json selected by default", async () => {
    const user = userEvent.setup();
    const { container } = render(<PlaygroundClient />);
    await loadExample(user);
    const tabs = screen.getAllByRole("tab");
    expect(
      tabs.map((t) => {
        return t.textContent;
      }),
    ).toEqual(["json", "types", "react", "html"]);
    expect(
      screen.getByRole("tab", { name: "json" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("tab", { name: "types" }).getAttribute("tabindex"),
    ).toBe("-1");
    expect(codeText(container)).toBe(generated.json);
  });

  it.each([
    ["json", "json"],
    ["types", "ts"],
    ["react", "tsx"],
    ["html", "html"],
  ] as const)(
    "shows the %s generator output with a .%s filename",
    async (id, ext) => {
      const user = userEvent.setup();
      const { container } = render(<PlaygroundClient />);
      await loadExample(user);
      await user.click(screen.getByRole("tab", { name: id }));
      expect(
        screen.getByRole("tab", { name: id }).getAttribute("aria-selected"),
      ).toBe("true");
      expect(codeText(container)).toBe(generated[id]);
      expect(filename(container)).toBe(`${schema.title || "form"}.${ext}`);
    },
  );

  it("moves selection and focus with ArrowRight, wrapping at the end", async () => {
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await loadExample(user);
    await user.click(screen.getByRole("tab", { name: "html" }));
    screen.getByRole("tab", { name: "html" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "json" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "json" }),
    );
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "types" }),
    );
  });

  it("moves selection and focus with ArrowLeft, wrapping at the start", async () => {
    const user = userEvent.setup();
    const { container } = render(<PlaygroundClient />);
    await loadExample(user);
    screen.getByRole("tab", { name: "json" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "html" }),
    );
    expect(codeText(container)).toBe(generated.html);
  });

  it("ignores other keys", async () => {
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    await loadExample(user);
    screen.getByRole("tab", { name: "json" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("tab", { name: "json" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  // TODO(bug): a11y gap - the tablist onKeyDown (PlaygroundClient.tsx:134-149) handles only ArrowLeft/ArrowRight; Home/End should select and focus the first/last tab per the WAI-ARIA tabs pattern.
  it("copies the active tab's output via the copy button", async () => {
    const writeText = vi.fn(() => {
      return Promise.resolve();
    });
    const user = userEvent.setup();
    render(<PlaygroundClient />);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await loadExample(user);
    await user.click(screen.getByRole("tab", { name: "types" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(generated.types);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    });
  });
});

describe("playground page", () => {
  it("exports the Playground title metadata", () => {
    expect(metadata.title).toBe("Playground");
  });

  it("renders the heading and mounts PlaygroundClient", () => {
    render(<PlaygroundPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Playground" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Google Form URL or id")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load example" })).toBeTruthy();
  });
});
