import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pager, Sidebar } from "../components/Sidebar";

const pathname = vi.hoisted(() => {
  return { value: "/" };
});
const pathnameMock = vi.hoisted(() => {
  return vi.fn();
});

vi.mock("next/navigation", () => {
  return { usePathname: pathnameMock };
});

const ROUTES = [
  { href: "/", label: "Overview" },
  { href: "/getting-started", label: "Getting started" },
  { href: "/playground", label: "Playground" },
  { href: "/guides/finding-your-form", label: "Finding your form" },
  { href: "/guides/question-types", label: "Question types" },
  { href: "/packages/core", label: "@ez-gform/core" },
  { href: "/packages/react", label: "@ez-gform/react" },
  { href: "/packages/codegen", label: "@ez-gform/codegen" },
  { href: "/packages/cli", label: "@ez-gform/cli" },
];

beforeEach(() => {
  pathname.value = "/";
  pathnameMock.mockImplementation(() => {
    return pathname.value;
  });
});

const link = (name: string | RegExp) => {
  return screen.getByRole("link", { name });
};

describe("Sidebar", () => {
  it("renders a link for every route and the GitHub link", () => {
    render(<Sidebar />);
    for (const route of ROUTES) {
      expect(link(route.label).getAttribute("href")).toBe(route.href);
    }
    expect(link(/github/i).getAttribute("target")).toBe("_blank");
  });

  it.each(ROUTES)("marks only $href active at that path", (route) => {
    pathname.value = route.href;
    render(<Sidebar />);
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe(route.label);
    expect(current[0]?.classList.contains("active")).toBe(true);
  });

  it("keeps a parent active for nested paths, but not Overview", () => {
    pathname.value = "/packages/core/extra";
    render(<Sidebar />);
    expect(link("@ez-gform/core").getAttribute("aria-current")).toBe("page");
    expect(link("Overview").getAttribute("aria-current")).toBeNull();
  });

  it("marks nothing active for an unknown path", () => {
    pathname.value = "/nope";
    render(<Sidebar />);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("toggles the mobile menu and closes it on link click", () => {
    render(<Sidebar />);
    const nav = () => {
      return document.getElementById("sidebar-nav");
    };
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(
      screen
        .getByRole("button", { name: "Close" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(nav()?.classList.contains("open")).toBe(true);
    // jsdom cannot navigate; cancel the default action after React has handled the click.
    const stop = (event: Event) => {
      event.preventDefault();
    };
    document.addEventListener("click", stop);
    fireEvent.click(link("Playground"));
    document.removeEventListener("click", stop);
    expect(
      screen
        .getByRole("button", { name: "Menu" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(nav()?.classList.contains("open")).toBe(false);
  });
});

describe("Pager", () => {
  it.each(
    ROUTES.map((r, i) => {
      return [r, i] as const;
    }),
  )("shows correct prev/next at $0.href", (route, i) => {
    pathname.value = route.href;
    render(<Pager />);
    const nav = screen.getByRole("navigation", {
      name: "Previous and next page",
    });
    const prev = ROUTES[i - 1];
    const next = ROUTES[i + 1];
    expect(within(nav).queryAllByRole("link")).toHaveLength(
      (prev ? 1 : 0) + (next ? 1 : 0),
    );
    const check = (
      label: string,
      target: (typeof ROUTES)[number] | undefined,
    ) => {
      if (!target) {
        expect(within(nav).queryByText(label)).toBeNull();
        return;
      }
      const anchor = within(nav).getByText(label).closest("a");
      expect(anchor?.getAttribute("href")).toBe(target.href);
      expect(anchor?.textContent).toBe(`${label}${target.label}`);
    };
    check("Previous", prev);
    check("Next", next);
  });

  it("renders nothing for an unknown path", () => {
    pathname.value = "/nope";
    const { container } = render(<Pager />);
    expect(container.innerHTML).toBe("");
  });
});
