"use client";

import { useState } from "react";

export interface CodeProps {
  children: string;
  language?: string;
  filename?: string;
}

/** A `<pre>` code block with a copy-to-clipboard button. No syntax highlighting dependency required. */
export const Code = ({ children, language, filename }: CodeProps) => {
  const [status, setStatus] = useState<"copied" | "failed" | null>(null);

  const flash = (next: "copied" | "failed") => {
    setStatus(next);
    setTimeout(() => {
      return setStatus(null);
    }, 1500);
  };

  const onCopy = () => {
    navigator.clipboard.writeText(children).then(
      () => {
        flash("copied");
      },
      () => {
        flash("failed");
      },
    );
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{filename ?? language ?? "code"}</span>
        <button type="button" onClick={onCopy} className="copy-button">
          {status === "copied"
            ? "Copied"
            : status === "failed"
              ? "Copy failed"
              : "Copy"}
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
};
