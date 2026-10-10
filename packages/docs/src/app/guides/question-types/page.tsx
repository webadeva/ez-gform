import { Code } from "@/components/Code";

const example = `setValue("entry.1", "Jane");                          // short answer
setValue("entry.2", ["Swimming", "Chess"]);           // checkboxes
setValue("entry.3", { other: "Kite surfing" });       // "Other" option
setValue("entry.4", { year: 2026, month: 3, day: 9 }); // date`;

const ROWS: { type: string; value: string; note?: string }[] = [
  { type: "Short answer", value: `"text"` },
  { type: "Paragraph", value: `"text"`, note: "Use \\n for line breaks." },
  { type: "Multiple choice", value: `"Option text"` },
  { type: "Dropdown", value: `"Option text"` },
  { type: "Checkboxes", value: `["Option A", "Option B"]` },
  {
    type: `"Other" option`,
    value: `{ other: "my text" }`,
    note: "Works in multiple choice, and inside a checkboxes array.",
  },
  { type: "Linear scale", value: "4" },
  {
    type: "Date",
    value: "{ year, month, day }",
    note: "year is optional. Add hour and minute if the question asks for a time.",
  },
  {
    type: "Time",
    value: "{ hour, minute }",
    note: "Duration questions also take an optional second.",
  },
  {
    type: "Multiple choice grid",
    value: `{ "entry.<rowId>": "Column" }`,
    note: "One key per row. Each row has its own entry id.",
  },
  {
    type: "Checkbox grid",
    value: `{ "entry.<rowId>": ["Col A", "Col B"] }`,
  },
  {
    type: "File upload",
    value: "not supported",
    note: "Google requires sign-in for uploads.",
  },
];

export default function QuestionTypesPage() {
  return (
    <div>
      <h1>Question types</h1>
      <p>
        What value to pass for each kind of Google Forms question. The same
        shapes work in <code>useGoogleForm</code> and in{" "}
        <code>@ez-gform/core</code>.
      </p>

      <table>
        <thead>
          <tr>
            <th>Question</th>
            <th>Value</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            return (
              <tr key={row.type}>
                <td>{row.type}</td>
                <td>
                  <code>{row.value}</code>
                </td>
                <td>{row.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Code language="ts">{example}</Code>

      <h2>Watch out for</h2>
      <ul>
        <li>
          Option text must match the form <strong>exactly</strong>, including
          case and spaces. Google silently drops answers that don&apos;t match.
        </li>
        <li>
          Empty strings, <code>null</code> and <code>undefined</code> are
          skipped, not sent as blank answers.
        </li>
        <li>
          Pass a <code>schema</code> to <code>useGoogleForm</code> (or call{" "}
          <code>validateValues</code>) to catch wrong entry ids and missing
          required answers before submitting.
        </li>
      </ul>

      <h2>Writing plain HTML by hand?</h2>
      <p>
        Most inputs just use <code>name=&quot;entry.N&quot;</code>, but a few
        types split into several fields: dates are <code>entry.N_year</code>,{" "}
        <code>entry.N_month</code>, <code>entry.N_day</code>; times are{" "}
        <code>entry.N_hour</code>, <code>entry.N_minute</code>;
        &quot;Other&quot; sends <code>entry.N=__other_option__</code> plus{" "}
        <code>entry.N.other_option_response</code>. It&apos;s easier to let{" "}
        <a href="/packages/cli">the CLI</a> generate the form with{" "}
        <code>--format html</code>.
      </p>
    </div>
  );
}
