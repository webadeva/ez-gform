import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export const coreDtsPath = `${repoRoot}packages/core/dist/index.d.ts`;
export const reactDtsPath = `${repoRoot}packages/react/dist/index.d.ts`;

/** Transpiles-only (no type info) — guarantees the text is syntactically valid TS/TSX. */
export const transpiles = (
  source: string,
  fileName = "generated.tsx",
): { ok: boolean; diagnostics: string[] } => {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
    fileName,
  });
  const diagnostics = (result.diagnostics ?? []).map((d) => {
    return ts.flattenDiagnosticMessageText(d.messageText, "\n");
  });
  return { ok: diagnostics.length === 0, diagnostics };
};

/**
 * Full `ts.createProgram` type-check of `source` against the real, built
 * `@ez-gform/core`/`@ez-gform/react` `.d.ts` files, via an in-memory virtual
 * file (no writes to disk). Throws if the referenced package(s) haven't been
 * built yet (no `dist/index.d.ts`), so tests can never pass vacuously.
 */
export const typeCheck = (
  source: string,
  opts: { needsReact?: boolean; fileName?: string } = {},
): { ok: boolean; diagnostics: string[] } => {
  const needsReact = opts.needsReact ?? false;
  // Use a virtual path inside a real package directory (rather than a
  // made-up path like "/virtual") so TypeScript's module resolution climbs
  // through real `node_modules` directories on disk when resolving bare
  // imports like "react/jsx-runtime".
  const fileName =
    opts.fileName ??
    `${repoRoot}packages/${needsReact ? "react" : "codegen"}/src/__generated__/generated.tsx`;

  if (!existsSync(coreDtsPath)) {
    throw new Error(`build @ez-gform/core first: ${coreDtsPath} missing`);
  }
  if (needsReact && !existsSync(reactDtsPath)) {
    throw new Error(`build @ez-gform/react first: ${reactDtsPath} missing`);
  }

  const compilerOptions: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    noUncheckedIndexedAccess: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: repoRoot,
    paths: {
      "@ez-gform/core": [coreDtsPath],
      ...(needsReact ? { "@ez-gform/react": [reactDtsPath] } : {}),
    },
  };

  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) => {
    if (name === fileName) {
      return ts.createSourceFile(
        name,
        source,
        languageVersion,
        true,
        ts.ScriptKind.TSX,
      );
    }
    return originalGetSourceFile(name, languageVersion, ...rest);
  };
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (name) => {
    return name === fileName || originalFileExists(name);
  };
  const originalReadFile = host.readFile.bind(host);
  host.readFile = (name) => {
    return name === fileName ? source : originalReadFile(name);
  };

  const program = ts.createProgram([fileName], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const messages = diagnostics.map((d) => {
    const location = d.file
      ? ` (${d.file.fileName}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1})`
      : "";
    return `${ts.flattenDiagnosticMessageText(d.messageText, "\n")}${location}`;
  });

  return { ok: messages.length === 0, diagnostics: messages };
};
