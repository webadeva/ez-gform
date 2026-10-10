"use client";

import type { UseGoogleFormReturn } from "@ez-gform/react";
import { useGoogleForm } from "@ez-gform/react";
import type {
  ChoiceOption,
  DateValue,
  FieldValue,
  FormSchema,
  Question,
  TimeValue,
} from "@ez-gform/types";
import { useId } from "react";

export interface SchemaFormProps {
  schema: FormSchema;
}

const isOtherValue = (value: unknown): value is { other: string } => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.other === "string";
};

const isDateValue = (value: unknown): value is DateValue => {
  return (
    typeof value === "object" &&
    value !== null &&
    "month" in value &&
    "day" in value
  );
};

const isTimeValue = (value: unknown): value is TimeValue => {
  return (
    typeof value === "object" &&
    value !== null &&
    "hour" in value &&
    "minute" in value &&
    !("month" in value)
  );
};

const ShortAnswerField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const multiline = question.type === "paragraph";
  const field = form.register(question.entryId);
  return (
    <div className="field">
      <label htmlFor={question.entryId}>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      {multiline ? (
        <textarea id={question.entryId} rows={3} {...field} />
      ) : (
        <input id={question.entryId} type="text" {...field} />
      )}
    </div>
  );
};

const ChoiceOtherInput = ({
  entryId,
  id,
  option,
  currentValue,
  onSelectOther,
  onOtherTextChange,
  inputType,
}: {
  entryId: string;
  id: string;
  option: ChoiceOption;
  currentValue: FieldValue;
  onSelectOther: () => void;
  onOtherTextChange: (text: string) => void;
  inputType: "radio" | "checkbox";
}) => {
  const otherText = isOtherValue(currentValue) ? currentValue.other : "";
  const isSelected = isOtherValue(currentValue);
  return (
    <div className="option">
      <input
        id={id}
        type={inputType}
        name={entryId}
        checked={isSelected}
        onChange={onSelectOther}
      />
      <label htmlFor={id}>Other:</label>
      <input
        type="text"
        value={otherText}
        onChange={(event) => {
          onOtherTextChange(event.target.value);
        }}
        aria-label={`${option.value || "Other"} response`}
      />
    </div>
  );
};

const RadioField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const baseId = useId();
  const currentValue = form.values[question.entryId];
  const options = question.options ?? [];
  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      {options.map((option, index) => {
        const id = `${baseId}-${index}`;
        if (option.isOther) {
          return (
            <ChoiceOtherInput
              key="other"
              id={id}
              entryId={question.entryId}
              option={option}
              currentValue={currentValue}
              inputType="radio"
              onSelectOther={() => {
                form.setValue(question.entryId, { other: "" });
              }}
              onOtherTextChange={(text) => {
                form.setValue(question.entryId, { other: text });
              }}
            />
          );
        }
        return (
          <div className="option" key={option.value}>
            <input
              id={id}
              type="radio"
              name={question.entryId}
              value={option.value}
              checked={currentValue === option.value}
              onChange={() => {
                form.setValue(question.entryId, option.value);
              }}
            />
            <label htmlFor={id}>{option.value}</label>
          </div>
        );
      })}
    </div>
  );
};

const DropdownField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const currentValue = form.values[question.entryId];
  const stringValue = typeof currentValue === "string" ? currentValue : "";
  const options = question.options ?? [];
  return (
    <div className="field">
      <label htmlFor={question.entryId}>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      <select
        id={question.entryId}
        value={stringValue}
        onChange={(event) => {
          form.setValue(question.entryId, event.target.value);
        }}
      >
        <option value="">Select…</option>
        {options
          .filter((option) => {
            return !option.isOther;
          })
          .map((option) => {
            return (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            );
          })}
      </select>
    </div>
  );
};

const CheckboxesField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const baseId = useId();
  const currentValue = form.values[question.entryId];
  const list = Array.isArray(currentValue) ? currentValue : [];
  const otherEntry = list.find(isOtherValue);
  const options = question.options ?? [];

  const setOther = (patch: Partial<{ selected: boolean; text: string }>) => {
    const withoutOther = list.filter((entry) => {
      return !isOtherValue(entry);
    });
    const selected = patch.selected ?? Boolean(otherEntry);
    if (!selected) {
      form.setValue(question.entryId, withoutOther);
      return;
    }
    const text =
      patch.text ?? (isOtherValue(otherEntry) ? otherEntry.other : "");
    form.setValue(question.entryId, [...withoutOther, { other: text }]);
  };

  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      {options.map((option, index) => {
        const id = `${baseId}-${index}`;
        if (option.isOther) {
          return (
            <div className="option" key="other">
              <input
                id={id}
                type="checkbox"
                checked={Boolean(otherEntry)}
                onChange={(event) => {
                  setOther({ selected: event.target.checked });
                }}
              />
              <label htmlFor={id}>Other:</label>
              <input
                type="text"
                value={isOtherValue(otherEntry) ? otherEntry.other : ""}
                onChange={(event) => {
                  setOther({ selected: true, text: event.target.value });
                }}
              />
            </div>
          );
        }
        const checkboxField = form.registerCheckbox(
          question.entryId,
          option.value,
        );
        return (
          <div className="option" key={option.value}>
            <input
              id={id}
              type="checkbox"
              checked={checkboxField.checked}
              onChange={checkboxField.onChange}
            />
            <label htmlFor={id}>{option.value}</label>
          </div>
        );
      })}
    </div>
  );
};

const LinearScaleField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const currentValue = form.values[question.entryId];
  const min = question.scale?.min ?? 1;
  const max = question.scale?.max ?? 5;
  const points = Array.from({ length: max - min + 1 }, (_, index) => {
    return min + index;
  });
  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      <div className="option">
        {question.scale?.lowLabel && <span>{question.scale.lowLabel}</span>}
        {points.map((point) => {
          return (
            <label key={point} style={{ marginRight: "0.5rem" }}>
              <input
                type="radio"
                name={question.entryId}
                checked={currentValue === point}
                onChange={() => {
                  form.setValue(question.entryId, point);
                }}
              />
              {point}
            </label>
          );
        })}
        {question.scale?.highLabel && <span>{question.scale.highLabel}</span>}
      </div>
    </div>
  );
};

const DateField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const currentValue = form.values[question.entryId];
  const dateValue = isDateValue(currentValue) ? currentValue : undefined;
  const includeTime = question.date?.includeTime ?? false;
  const includeYear = question.date?.includeYear ?? true;

  // Empty parts stay `undefined` (the encoder omits them); seeding a default
  // would corrupt the next part typed (Day then Month "3" became month 13).
  const patch = (
    next: Partial<Record<keyof DateValue, number | undefined>>,
  ) => {
    const base = (dateValue ?? {
      month: undefined,
      day: undefined,
    }) as Partial<DateValue>;
    const merged = { ...base, ...next };
    const allEmpty = Object.values(merged).every((v) => {
      return v === undefined;
    });
    form.setValue(
      question.entryId,
      allEmpty ? undefined : (merged as DateValue),
    );
  };
  const part = (raw: string) => {
    return raw === "" ? undefined : Number(raw);
  };

  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      <div className="option">
        <input
          type="number"
          aria-label="Month"
          placeholder="MM"
          value={dateValue?.month ?? ""}
          onChange={(event) => {
            patch({ month: part(event.target.value) });
          }}
        />
        <input
          type="number"
          aria-label="Day"
          placeholder="DD"
          value={dateValue?.day ?? ""}
          onChange={(event) => {
            patch({ day: part(event.target.value) });
          }}
        />
        {includeYear && (
          <input
            type="number"
            aria-label="Year"
            placeholder="YYYY"
            value={dateValue?.year ?? ""}
            onChange={(event) => {
              patch({ year: part(event.target.value) });
            }}
          />
        )}
        {includeTime && (
          <>
            <input
              type="number"
              aria-label="Hour"
              placeholder="HH"
              value={dateValue?.hour ?? ""}
              onChange={(event) => {
                patch({ hour: part(event.target.value) });
              }}
            />
            <input
              type="number"
              aria-label="Minute"
              placeholder="mm"
              value={dateValue?.minute ?? ""}
              onChange={(event) => {
                patch({ minute: part(event.target.value) });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

const TimeField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const currentValue = form.values[question.entryId];
  const timeValue = isTimeValue(currentValue) ? currentValue : undefined;
  const isDuration = question.time?.isDuration ?? false;

  // Empty parts stay `undefined` (never seeded with 0), so a required time
  // with a missing part fails validation instead of submitting 00.
  const patch = (
    next: Partial<Record<keyof TimeValue, number | undefined>>,
  ) => {
    const base = (timeValue ?? {
      hour: undefined,
      minute: undefined,
    }) as Partial<TimeValue>;
    const merged = { ...base, ...next };
    const allEmpty = Object.values(merged).every((v) => {
      return v === undefined;
    });
    form.setValue(
      question.entryId,
      allEmpty ? undefined : (merged as TimeValue),
    );
  };
  const part = (raw: string) => {
    return raw === "" ? undefined : Number(raw);
  };

  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      <div className="option">
        <input
          type="number"
          aria-label={isDuration ? "Hours" : "Hour"}
          placeholder="HH"
          min={0}
          max={23}
          value={timeValue?.hour ?? ""}
          onChange={(event) => {
            patch({ hour: part(event.target.value) });
          }}
        />
        <input
          type="number"
          aria-label={isDuration ? "Minutes" : "Minute"}
          placeholder="mm"
          min={0}
          max={59}
          value={timeValue?.minute ?? ""}
          onChange={(event) => {
            patch({ minute: part(event.target.value) });
          }}
        />
        {isDuration && (
          <input
            type="number"
            aria-label="Seconds"
            placeholder="ss"
            min={0}
            max={59}
            value={timeValue?.second ?? ""}
            onChange={(event) => {
              patch({ second: part(event.target.value) });
            }}
          />
        )}
      </div>
    </div>
  );
};

const GridField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  const isCheckboxGrid = question.type === "checkbox_grid";
  const columns = question.options ?? [];
  const rows = question.rows ?? [];

  return (
    <div className="field">
      <label>
        {question.title}
        {question.required ? " *" : ""}
      </label>
      <table className="grid-table">
        <thead>
          <tr>
            <th />
            {columns.map((col) => {
              return <th key={col.value}>{col.value}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowValue = form.values[row.entryId];
            return (
              <tr key={row.entryId}>
                <td>{row.label}</td>
                {columns.map((col) => {
                  if (isCheckboxGrid) {
                    const list = Array.isArray(rowValue) ? rowValue : [];
                    const checked = list.includes(col.value);
                    return (
                      <td key={col.value}>
                        <input
                          type="checkbox"
                          aria-label={`${row.label}: ${col.value}`}
                          checked={checked}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...list, col.value]
                              : list.filter((v) => {
                                  return v !== col.value;
                                });
                            form.setValue(row.entryId, next);
                          }}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={col.value}>
                      <input
                        type="radio"
                        aria-label={`${row.label}: ${col.value}`}
                        name={row.entryId}
                        checked={rowValue === col.value}
                        onChange={() => {
                          form.setValue(row.entryId, col.value);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const QuestionField = ({
  question,
  form,
}: {
  question: Question;
  form: UseGoogleFormReturn;
}) => {
  switch (question.type) {
    case "short_answer":
    case "paragraph":
      return <ShortAnswerField question={question} form={form} />;
    case "multiple_choice":
      return <RadioField question={question} form={form} />;
    case "dropdown":
      return <DropdownField question={question} form={form} />;
    case "checkboxes":
      return <CheckboxesField question={question} form={form} />;
    case "linear_scale":
      return <LinearScaleField question={question} form={form} />;
    case "date":
      return <DateField question={question} form={form} />;
    case "time":
      return <TimeField question={question} form={form} />;
    case "grid":
    case "checkbox_grid":
      return <GridField question={question} form={form} />;
    case "file_upload":
      return (
        <div className="field">
          <label>{question.title}</label>
          <p className="error-box" style={{ color: "var(--muted)" }}>
            File upload questions aren&apos;t submittable through the public
            formResponse endpoint — unsupported.
          </p>
        </div>
      );
    default:
      return null;
  }
};

/** Renders every question in a `FormSchema`, wired to `useGoogleForm`, with a submit button and prefill link. */
export const SchemaForm = ({ schema }: SchemaFormProps) => {
  const form = useGoogleForm({ formId: schema.formId, schema });

  return (
    <form
      onSubmit={(event) => {
        void form.submit(event);
      }}
      aria-label={schema.title || "Google Form"}
    >
      {schema.questions.map((question) => {
        return (
          <QuestionField key={question.id} question={question} form={form} />
        );
      })}

      <div className="form-row">
        <button type="submit" className="btn" disabled={form.isSubmitting}>
          {form.isSubmitting ? "Sending…" : "Submit to Google Form"}
        </button>
        {form.status !== "idle" && (
          <span className={`status-badge ${form.status}`}>{form.status}</span>
        )}
      </div>

      {form.errors.length > 0 && (
        <div className="error-box">
          <ul>
            {form.errors.map((error) => {
              return <li key={error.entryId}>{error.message}</li>;
            })}
          </ul>
        </div>
      )}

      {form.prefillUrl && (
        <p>
          <a href={form.prefillUrl} target="_blank" rel="noreferrer">
            Prefill URL ↗
          </a>
        </p>
      )}
    </form>
  );
};
