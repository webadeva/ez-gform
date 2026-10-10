import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { run } from "../helpers/exec.js";
import {
  FIXTURE_JSON_PATH,
  REPO_ROOT,
  loadFixtureSchema,
} from "../helpers/live.js";

const PACKAGES = ["types", "core", "codegen", "react", "cli"] as const;

interface Lockfile {
  packages: Record<string, { resolved?: string; version?: string }>;
}

let tmp = "";
let app = "";
let workspaceVersion = "";
const tarballs: Record<string, string> = {};

const readJson = <T>(path: string): T => {
  return JSON.parse(readFileSync(path, "utf8")) as T;
};

const esmKeys = async (pkg: string): Promise<string[]> => {
  const { stdout } = await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import * as m from '@ez-gform/${pkg}'; console.log(JSON.stringify(Object.keys(m).sort()))`,
    ],
    app,
  );
  return JSON.parse(stdout) as string[];
};

const cjsKeys = async (pkg: string): Promise<string[]> => {
  const { stdout } = await run(
    process.execPath,
    [
      "-e",
      `console.log(JSON.stringify(Object.keys(require('@ez-gform/${pkg}')).sort()))`,
    ],
    app,
  );
  return JSON.parse(stdout) as string[];
};

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "ez-gform-packed-"));
  app = join(tmp, "app");
  const tgzDir = join(tmp, "tgz");
  mkdirSync(app);
  mkdirSync(tgzDir);
  workspaceVersion = readJson<{ version: string }>(
    join(REPO_ROOT, "packages/core/package.json"),
  ).version;

  for (const pkg of PACKAGES) {
    const { stdout } = await run(
      "pnpm",
      ["pack", "--pack-destination", tgzDir],
      join(REPO_ROOT, "packages", pkg),
    );
    const file = stdout.trim().split("\n").pop() ?? "";
    tarballs[pkg] = file.startsWith("/") ? file : join(tgzDir, file);
  }

  await run("npm", ["init", "-y"], app);
  await run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      ...PACKAGES.map((pkg) => {
        return tarballs[pkg] ?? "";
      }),
    ],
    app,
  );
});

afterAll(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true, force: true });
  }
});

describe("packed tarball install", () => {
  it("rewrites workspace:* to the real version in the packed manifests", async () => {
    const { stdout } = await run(
      "tar",
      ["-xzOf", tarballs.core ?? "", "package/package.json"],
      tmp,
    );
    const manifest = JSON.parse(stdout) as {
      version: string;
      dependencies: Record<string, string>;
    };
    expect(manifest.version).toBe(workspaceVersion);
    expect(manifest.dependencies["@ez-gform/types"]).toBe(workspaceVersion);
  });

  it("installs @ez-gform/* from the local tarballs, not the registry", () => {
    const installed = readJson<{ version: string }>(
      join(app, "node_modules/@ez-gform/core/package.json"),
    );
    expect(installed.version).toBe(workspaceVersion);

    const lock = readJson<Lockfile>(join(app, "package-lock.json"));
    const ours = Object.entries(lock.packages).filter(([key]) => {
      return key.includes("node_modules/@ez-gform/");
    });
    expect(
      ours
        .map(([key]) => {
          return key;
        })
        .sort(),
    ).toEqual(
      PACKAGES.map((pkg) => {
        return `node_modules/@ez-gform/${pkg}`;
      }).sort(),
    );
    for (const [key, entry] of ours) {
      expect(entry.resolved, key).toMatch(/^file:/);
      expect(entry.resolved, key).not.toMatch(/registry\.npmjs/);
    }
  });

  it("ships a working ez-gform bin", async () => {
    const bin = join(app, "node_modules/.bin/ez-gform");
    const version = await run(bin, ["--version"], app);
    expect(version.stdout.trim()).toBe(workspaceVersion);

    // No positional form arg is needed with --json-input.
    const out = await run(
      bin,
      ["--json-input", FIXTURE_JSON_PATH, "--format", "json"],
      app,
    );
    expect(JSON.parse(out.stdout)).toEqual(loadFixtureSchema());
  });

  it("exposes the expected ESM exports", async () => {
    expect(await esmKeys("core")).toEqual([
      "ParseError",
      "VERSION",
      "ValidationError",
      "buildPrefillUrl",
      "buildSubmitBody",
      "encodeValues",
      "extractPublicLoadData",
      "formUrls",
      "normalizeFormId",
      "parseFormData",
      "parseFormHtml",
      "submitForm",
      "validateValues",
    ]);
    expect(await esmKeys("codegen")).toEqual([
      "generateHtmlForm",
      "generateReactComponent",
      "generateSchemaJson",
      "generateTypes",
      "toIdentifier",
      "toPascalCase",
    ]);
    expect(await esmKeys("react")).toEqual(["useGoogleForm"]);
    expect(await esmKeys("types")).toEqual([]);
  });

  it("exposes the expected CJS exports", async () => {
    expect(await cjsKeys("core")).toEqual([
      "ParseError",
      "VERSION",
      "ValidationError",
      "buildPrefillUrl",
      "buildSubmitBody",
      "encodeValues",
      "extractPublicLoadData",
      "formUrls",
      "normalizeFormId",
      "parseFormData",
      "parseFormHtml",
      "submitForm",
      "validateValues",
    ]);
    expect(await cjsKeys("codegen")).toEqual([
      "generateHtmlForm",
      "generateReactComponent",
      "generateSchemaJson",
      "generateTypes",
      "toIdentifier",
      "toPascalCase",
    ]);
    expect(await cjsKeys("react")).toEqual(["useGoogleForm"]);
    expect(await cjsKeys("types")).toEqual([]);
  });
});
