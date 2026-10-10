"use client";

import { Code } from "@/components/Code";
import { SchemaForm } from "@/components/SchemaForm";
import {
  generateHtmlForm,
  generateReactComponent,
  generateSchemaJson,
  generateTypes,
} from "@ez-gform/codegen";
import { parseFormData } from "@ez-gform/core";
import type { FormSchema } from "@ez-gform/types";
import { useMemo, useState } from "react";
import allQuestionTypes from "./all-question-types.fixture.json";

type Tab = "json" | "types" | "react" | "html";

const TABS: { id: Tab; label: string }[] = [
  { id: "json", label: "json" },
  { id: "types", label: "types" },
  { id: "react", label: "react" },
  { id: "html", label: "html" },
];

export const PlaygroundClient = () => {
  const [input, setInput] = useState("");
  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("json");

  const loadFromUrl = async () => {
    if (!input.trim()) {
      setError("Enter a Google Form URL or id first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/schema?formId=${encodeURIComponent(input.trim())}`,
      );
      const body = (await response.json()) as
        { schema: FormSchema } | { error: string };
      if (!response.ok || "error" in body) {
        setError(
          "error" in body ? body.error : `Request failed (${response.status})`,
        );
        setSchema(null);
        return;
      }
      setSchema(body.schema);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSchema(null);
    } finally {
      setLoading(false);
    }
  };

  const loadExample = () => {
    setError(null);
    try {
      // The fixture is the raw FB_PUBLIC_LOAD_DATA_ JSON captured from a
      // live form; parseFormData turns it into a typed FormSchema, entirely
      // client-side, so the playground works with no network access.
      const parsed = parseFormData(allQuestionTypes);
      setSchema(parsed);
      setInput(parsed.formId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const generated = useMemo(() => {
    if (!schema) return null;
    return {
      json: generateSchemaJson(schema),
      types: generateTypes(schema),
      react: generateReactComponent(schema),
      html: generateHtmlForm(schema),
    };
  }, [schema]);

  return (
    <div className="playground">
      <form
        className="form-row"
        onSubmit={(event) => {
          event.preventDefault();
          void loadFromUrl();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
          }}
          placeholder="https://docs.google.com/forms/d/e/.../viewform or bare form id"
          aria-label="Google Form URL or id"
        />
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Loading…" : "Load schema"}
        </button>
        <button type="button" className="btn secondary" onClick={loadExample}>
          Load example
        </button>
      </form>

      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}

      {!schema && !error && (
        <div className="empty-state">
          <p>
            Your form&apos;s questions, entry ids and generated code will show
            up here.
          </p>
        </div>
      )}

      {schema && generated && (
        <div className="playground-grid two-col">
          <div>
            <h2>Generated output</h2>
            <div
              className="tabs"
              role="tablist"
              aria-label="Output format"
              onKeyDown={(event) => {
                const index = TABS.findIndex((t) => {
                  return t.id === tab;
                });
                const target =
                  event.key === "ArrowRight"
                    ? index + 1
                    : event.key === "ArrowLeft"
                      ? index - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? TABS.length - 1
                          : null;
                if (target === null) return;
                const next = TABS[(target + TABS.length) % TABS.length];
                if (!next) return;
                event.preventDefault();
                setTab(next.id);
                document.getElementById(`tab-${next.id}`)?.focus();
              }}
            >
              {TABS.map((t) => {
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={tab === t.id}
                    tabIndex={tab === t.id ? 0 : -1}
                    className={
                      tab === t.id ? "tab-button active" : "tab-button"
                    }
                    onClick={() => {
                      setTab(t.id);
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <Code
              language={tab}
              filename={`${schema.title || "form"}.${tab === "json" ? "json" : tab === "types" ? "ts" : tab === "react" ? "tsx" : "html"}`}
            >
              {generated[tab]}
            </Code>
          </div>

          <div>
            <h2>Live form</h2>
            <p className="playground-note">
              Rendered from the parsed schema via <code>useGoogleForm</code>.
              Submitting uses <code>mode: &quot;no-cors&quot;</code>, so a
              successful-looking &quot;sent&quot; status doesn&apos;t confirm
              Google accepted it.
            </p>
            <SchemaForm schema={schema} />
          </div>
        </div>
      )}
    </div>
  );
};
