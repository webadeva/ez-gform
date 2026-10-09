import { describe, expect, it } from "vitest";
import { formUrls, normalizeFormId } from "../url.js";

const ID = "1FAIpQLScXpdCnyzcv0h5_3giJaB9vP_00UIXggzt4UAfMamwPApnINw";

describe("normalizeFormId", () => {
  it("accepts a bare id", () => {
    expect(normalizeFormId(ID)).toBe(ID);
  });

  it("accepts an 'e/<id>' string", () => {
    expect(normalizeFormId(`e/${ID}`)).toBe(ID);
  });

  it("accepts a full viewform URL", () => {
    expect(
      normalizeFormId(`https://docs.google.com/forms/d/e/${ID}/viewform`),
    ).toBe(ID);
  });

  it("accepts a viewform URL with a multi-account /u/<n>/ segment", () => {
    expect(
      normalizeFormId(`https://docs.google.com/forms/u/0/d/e/${ID}/viewform`),
    ).toBe(ID);
  });

  it("accepts an editor /d/<id>/edit URL", () => {
    expect(normalizeFormId(`https://docs.google.com/forms/d/${ID}/edit`)).toBe(
      ID,
    );
  });

  it("accepts a URL with query params and a trailing slash", () => {
    expect(
      normalizeFormId(
        `https://docs.google.com/forms/d/e/${ID}/viewform?usp=sf_link`,
      ),
    ).toBe(ID);
    expect(
      normalizeFormId(`https://docs.google.com/forms/d/e/${ID}/viewform/`),
    ).toBe(ID);
  });

  it("accepts a scheme-less docs.google.com URL", () => {
    expect(normalizeFormId(`docs.google.com/forms/d/e/${ID}/viewform`)).toBe(
      ID,
    );
  });

  it("accepts http:// URLs and trims surrounding whitespace", () => {
    expect(
      normalizeFormId(`http://docs.google.com/forms/d/e/${ID}/viewform`),
    ).toBe(ID);
    expect(
      normalizeFormId(`  https://docs.google.com/forms/d/e/${ID}/viewform\n`),
    ).toBe(ID);
    expect(normalizeFormId(`  ${ID}  `)).toBe(ID);
    expect(normalizeFormId(`  e/${ID} `)).toBe(ID);
  });

  it("ignores query strings and hash fragments", () => {
    expect(
      normalizeFormId(
        `https://docs.google.com/forms/d/e/${ID}/viewform?usp=pp_url&entry.1=x#responses`,
      ),
    ).toBe(ID);
  });

  it("throws on URLs without an id after /d/ or /d/e/", () => {
    for (const url of [
      "https://docs.google.com/forms/d/",
      "https://docs.google.com/forms/d/e/",
      "https://docs.google.com/forms/",
    ]) {
      expect(() => {
        return normalizeFormId(url);
      }).toThrow(/could not find form id in URL/);
    }
  });

  it("throws on bare ids shorter than 10 characters or with invalid characters", () => {
    expect(() => {
      return normalizeFormId("abc123");
    }).toThrow(/not a recognizable/);
    expect(() => {
      return normalizeFormId("e/short");
    }).toThrow(/not a recognizable/);
    expect(() => {
      return normalizeFormId("1FAIpQLS/with/slashes");
    }).toThrow(/not a recognizable/);
  });

  it("throws on garbage input", () => {
    expect(() => {
      return normalizeFormId("");
    }).toThrow();
    expect(() => {
      return normalizeFormId("not a form id at all, just a sentence");
    }).toThrow();
    expect(() => {
      return normalizeFormId("https://example.com/not-a-form");
    }).toThrow();
  });
});

describe("formUrls", () => {
  it("builds viewform and formResponse URLs", () => {
    const urls = formUrls(ID);
    expect(urls).toEqual({
      viewform: `https://docs.google.com/forms/d/e/${ID}/viewform`,
      formResponse: `https://docs.google.com/forms/d/e/${ID}/formResponse`,
    });
  });

  it("throws on bad input", () => {
    expect(() => {
      return formUrls("nope");
    }).toThrow();
    expect(() => {
      return formUrls("");
    }).toThrow();
  });

  it("normalizes a URL input too", () => {
    const urls = formUrls(`https://docs.google.com/forms/d/e/${ID}/viewform`);
    expect(urls.viewform).toBe(
      `https://docs.google.com/forms/d/e/${ID}/viewform`,
    );
  });
});
