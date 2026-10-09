import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const pathnameMock = vi.hoisted(() => {
  return vi.fn(() => {
    return "/";
  });
});

vi.mock("next/navigation", () => {
  return { usePathname: pathnameMock };
});

vi.mock("next/font/google", () => {
  const font = (name: string) => {
    return (options: { variable: string }) => {
      return { className: `${name}-class`, variable: options.variable };
    };
  };
  return {
    ["Instrument_Sans"]: font("sans"),
    ["JetBrains_Mono"]: font("mono"),
  };
});

import GettingStartedPage from "../app/getting-started/page";
import FindingYourFormPage from "../app/guides/finding-your-form/page";
import QuestionTypesPage from "../app/guides/question-types/page";
import RootLayout, { metadata } from "../app/layout";
import CliPackagePage from "../app/packages/cli/page";
import CodegenPackagePage from "../app/packages/codegen/page";
import CorePackagePage from "../app/packages/core/page";
import ReactPackagePage from "../app/packages/react/page";
import HomePage from "../app/page";

const pages: [string, () => ReactElement, string][] = [
  ["home", HomePage, "ez-gform"],
  ["getting-started", GettingStartedPage, "Getting started"],
  ["finding-your-form", FindingYourFormPage, "Finding your form"],
  ["question-types", QuestionTypesPage, "Question types"],
  ["core", CorePackagePage, "@ez-gform/core"],
  ["react", ReactPackagePage, "@ez-gform/react"],
  ["codegen", CodegenPackagePage, "@ez-gform/codegen"],
  ["cli", CliPackagePage, "@ez-gform/cli"],
];

describe("static pages", () => {
  it.each(pages)("%s renders its h1 and code blocks", (_name, Page, h1) => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: h1 })).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: "Copy" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("RootLayout", () => {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p id="child">hello</p>
    </RootLayout>,
  );

  it("exports metadata", () => {
    expect(metadata.title).toEqual({
      default: "ez-gform docs",
      template: "%s · ez-gform",
    });
    expect(metadata.description).toMatch(/Google Form/);
  });

  it("renders children inside main, with sidebar, pager and skip link", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("main#content #child")).not.toBeNull();
    expect(doc.querySelector('nav[aria-label="Documentation"]')).not.toBeNull();
    expect(doc.querySelector("a.skip-link")?.getAttribute("href")).toBe(
      "#content",
    );
    // Pager is inside main (pathname "/" has a next page).
    expect(
      doc.querySelector('main nav[aria-label="Previous and next page"]'),
    ).not.toBeNull();
  });

  it("applies the font variables on <html>", () => {
    expect(html).toContain('lang="en"');
    expect(html).toContain("--font-sans");
    expect(html).toContain("--font-mono");
  });
});
