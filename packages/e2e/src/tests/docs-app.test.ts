import type { FormSchema } from "@ez-gform/types";
import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BOGUS_FORM_ID,
  LIVE_FORM_URL,
  REPO_ROOT,
  SIGNIN_FORM_ID,
  SIGNIN_FORM_URL,
  fetchLiveSchema,
  getFreePort,
} from "../helpers/live.js";

const DOCS_DIR = `${REPO_ROOT}packages/docs`;
const NEXT_BIN = `${DOCS_DIR}/node_modules/.bin/next`;
const BUILD_ID = `${DOCS_DIR}/.next/BUILD_ID`;

let child: ChildProcess | undefined;
let exited = false;
let stderr = "";
let base = "";
let liveSchema: FormSchema;

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitForServer = async (): Promise<void> => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`next start exited early. stderr:\n${stderr}`);
    }
    try {
      const res = await fetch(`${base}/`);
      if (res.status === 200) {
        return;
      }
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error(`next start not ready within 60s. stderr:\n${stderr}`);
};

const stopChild = async (): Promise<void> => {
  const proc = child;
  if (!proc || exited) {
    return;
  }
  const closed = new Promise<void>((resolve) => {
    proc.once("exit", () => {
      return resolve();
    });
  });
  proc.kill("SIGTERM");
  const timedOut = await Promise.race([
    closed.then(() => {
      return false;
    }),
    sleep(10_000).then(() => {
      return true;
    }),
  ]);
  if (timedOut) {
    proc.kill("SIGKILL");
    await closed;
  }
};

const schemaUrl = (formId: string): string => {
  return `${base}/api/schema?formId=${encodeURIComponent(formId)}`;
};

const withoutFbzx = (schema: FormSchema): Omit<FormSchema, "fbzx"> => {
  const rest: Partial<FormSchema> = { ...schema };
  delete rest.fbzx;
  return rest as Omit<FormSchema, "fbzx">;
};

beforeAll(async () => {
  if (!existsSync(BUILD_ID)) {
    const build = spawnSync("pnpm", ["--filter", "@ez-gform/docs", "build"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (build.status !== 0) {
      throw new Error(`docs build failed:\n${build.stdout}\n${build.stderr}`);
    }
  }
  const port = await getFreePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(NEXT_BIN, ["start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: DOCS_DIR,
    detached: false,
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr?.on("data", (d: Buffer) => {
    stderr += d.toString();
  });
  child.on("exit", () => {
    exited = true;
  });
  await waitForServer();
  liveSchema = await fetchLiveSchema();
});

afterAll(async () => {
  await stopChild();
});

describe("docs app (next start)", () => {
  it("serves GET / with 200", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
  });

  it("serves /playground as HTML containing the Load example button", async () => {
    const res = await fetch(`${base}/playground`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Load example");
  });

  it("GET /api/schema returns the live schema for a public form", async () => {
    const res = await fetch(schemaUrl(LIVE_FORM_URL));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schema: FormSchema };
    expect(withoutFbzx(body.schema)).toEqual(withoutFbzx(liveSchema));
    expect(typeof body.schema.fbzx).toBe("string");
  });

  it("GET /api/schema returns 401 for a sign-in-only form", async () => {
    const res = await fetch(schemaUrl(SIGNIN_FORM_URL));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("requires sign-in");
  });

  it("GET /api/schema accepts a bare id for the sign-in form too", async () => {
    const res = await fetch(schemaUrl(SIGNIN_FORM_ID));
    expect(res.status).toBe(401);
  });

  it("GET /api/schema returns 400 for an unrecognizable formId", async () => {
    const res = await fetch(schemaUrl("garbage"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("garbage");
  });

  it("GET /api/schema returns 400 when formId is missing", async () => {
    const res = await fetch(`${base}/api/schema`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("formId");
  });

  it("GET /api/schema reports a nonexistent form id", async () => {
    const res = await fetch(schemaUrl(BOGUS_FORM_ID));
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(res.status).toBe(404);
  });
});
