import { describe, expectTypeOf, it } from "vitest";

import type {
  ChoiceOption,
  CodegenFormat,
  DateValue,
  FieldValue,
  FormSchema,
  FormValues,
  GenerateReactOptions,
  GenerateSchemaJsonOptions,
  GenerateTypesOptions,
  GridRow,
  OtherValue,
  Question,
  QuestionType,
  Section,
  SubmitOptions,
  SubmitResult,
  TimeValue,
  ValidationIssue,
  ValidationResult,
} from "../index";

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];

describe("QuestionType", () => {
  it("is exactly the eleven supported question types", () => {
    expectTypeOf<QuestionType>().toEqualTypeOf<
      | "short_answer"
      | "paragraph"
      | "multiple_choice"
      | "dropdown"
      | "checkboxes"
      | "linear_scale"
      | "grid"
      | "checkbox_grid"
      | "date"
      | "time"
      | "file_upload"
    >();
  });
});

describe("schema types", () => {
  it("Question has the expected required and optional keys", () => {
    expectTypeOf<RequiredKeys<Question>>().toEqualTypeOf<
      "id" | "entryId" | "title" | "type" | "required"
    >();
    expectTypeOf<OptionalKeys<Question>>().toEqualTypeOf<
      "description" | "options" | "rows" | "scale" | "date" | "time"
    >();
  });

  it("Question is a single interface, not a discriminated union", () => {
    expectTypeOf<Question["type"]>().toEqualTypeOf<QuestionType>();
    expectTypeOf<Question["required"]>().toEqualTypeOf<boolean>();
  });

  it("Question type-specific metadata has the documented shapes", () => {
    expectTypeOf<Question["options"]>().toEqualTypeOf<
      ChoiceOption[] | undefined
    >();
    expectTypeOf<Question["rows"]>().toEqualTypeOf<GridRow[] | undefined>();
    expectTypeOf<Question["scale"]>().toEqualTypeOf<
      | { min: number; max: number; lowLabel?: string; highLabel?: string }
      | undefined
    >();
    expectTypeOf<Question["date"]>().toEqualTypeOf<
      { includeTime: boolean; includeYear: boolean } | undefined
    >();
    expectTypeOf<Question["time"]>().toEqualTypeOf<
      { isDuration: boolean } | undefined
    >();
  });

  it("ChoiceOption and GridRow are fully required", () => {
    expectTypeOf<ChoiceOption>().toEqualTypeOf<{
      value: string;
      isOther: boolean;
    }>();
    expectTypeOf<GridRow>().toEqualTypeOf<{ entryId: string; label: string }>();
  });

  it("Section has the expected required and optional keys", () => {
    expectTypeOf<RequiredKeys<Section>>().toEqualTypeOf<
      "title" | "questionIds"
    >();
    expectTypeOf<OptionalKeys<Section>>().toEqualTypeOf<"description">();
    expectTypeOf<Section["questionIds"]>().toEqualTypeOf<string[]>();
  });

  it("FormSchema has the expected required and optional keys", () => {
    expectTypeOf<RequiredKeys<FormSchema>>().toEqualTypeOf<
      "formId" | "title" | "questions" | "sections" | "multiPage"
    >();
    expectTypeOf<OptionalKeys<FormSchema>>().toEqualTypeOf<
      "description" | "fbzx"
    >();
    expectTypeOf<FormSchema["questions"]>().toEqualTypeOf<Question[]>();
    expectTypeOf<FormSchema["sections"]>().toEqualTypeOf<Section[]>();
    expectTypeOf<FormSchema["multiPage"]>().toEqualTypeOf<boolean>();
  });
});

describe("value types", () => {
  it("DateValue requires month and day; year and time parts are optional", () => {
    expectTypeOf<RequiredKeys<DateValue>>().toEqualTypeOf<"month" | "day">();
    expectTypeOf<OptionalKeys<DateValue>>().toEqualTypeOf<
      "year" | "hour" | "minute"
    >();
  });

  it("TimeValue and OtherValue are fully required", () => {
    expectTypeOf<TimeValue>().toEqualTypeOf<{ hour: number; minute: number }>();
    expectTypeOf<OtherValue>().toEqualTypeOf<{ other: string }>();
  });

  it("FieldValue is exactly the documented union", () => {
    expectTypeOf<FieldValue>().toEqualTypeOf<
      | string
      | number
      | string[]
      | (string | OtherValue)[]
      | OtherValue
      | DateValue
      | TimeValue
      | Record<string, string | string[]>
      | null
      | undefined
    >();
  });

  it("FieldValue accepts each answer shape", () => {
    expectTypeOf<string>().toExtend<FieldValue>();
    expectTypeOf<number>().toExtend<FieldValue>();
    expectTypeOf<string[]>().toExtend<FieldValue>();
    expectTypeOf<(string | OtherValue)[]>().toExtend<FieldValue>();
    expectTypeOf<OtherValue>().toExtend<FieldValue>();
    expectTypeOf<DateValue>().toExtend<FieldValue>();
    expectTypeOf<TimeValue>().toExtend<FieldValue>();
    expectTypeOf<Record<string, string[]>>().toExtend<FieldValue>();
    expectTypeOf<null>().toExtend<FieldValue>();
    expectTypeOf<undefined>().toExtend<FieldValue>();
    expectTypeOf<boolean>().not.toExtend<FieldValue>();
  });

  it("FormValues maps entry ids to FieldValue", () => {
    expectTypeOf<FormValues>().toEqualTypeOf<Record<string, FieldValue>>();
  });

  // TODO(bug): FieldValue should distinguish a time answer from a duration answer (Question.time.isDuration has no value-side counterpart).
});

describe("submit types", () => {
  it("SubmitResult is a union discriminated by status", () => {
    expectTypeOf<SubmitResult["status"]>().toEqualTypeOf<
      "sent" | "ok" | "error"
    >();
    expectTypeOf<Extract<SubmitResult, { status: "sent" }>>().toEqualTypeOf<{
      status: "sent";
    }>();
    expectTypeOf<Extract<SubmitResult, { status: "ok" }>>().toEqualTypeOf<{
      status: "ok";
      httpStatus: number;
    }>();
    expectTypeOf<Extract<SubmitResult, { status: "error" }>>().toEqualTypeOf<{
      status: "error";
      error: unknown;
      httpStatus?: number;
    }>();
  });

  it("SubmitOptions are all optional with the documented types", () => {
    expectTypeOf<RequiredKeys<SubmitOptions>>().toEqualTypeOf<never>();
    expectTypeOf<OptionalKeys<SubmitOptions>>().toEqualTypeOf<
      "schema" | "fetch" | "mode" | "signal"
    >();
    expectTypeOf<SubmitOptions["schema"]>().toEqualTypeOf<
      FormSchema | undefined
    >();
    expectTypeOf<SubmitOptions["fetch"]>().toEqualTypeOf<
      typeof fetch | undefined
    >();
    expectTypeOf<SubmitOptions["mode"]>().toEqualTypeOf<
      "no-cors" | "cors" | undefined
    >();
    expectTypeOf<SubmitOptions["signal"]>().toEqualTypeOf<
      AbortSignal | undefined
    >();
  });

  it("ValidationResult is a union discriminated by ok", () => {
    expectTypeOf<ValidationResult>().toEqualTypeOf<
      { ok: true } | { ok: false; errors: ValidationIssue[] }
    >();
    expectTypeOf<ValidationIssue>().toEqualTypeOf<{
      entryId: string;
      message: string;
    }>();
  });
});

describe("codegen option types", () => {
  it("CodegenFormat is exactly the four output formats", () => {
    expectTypeOf<CodegenFormat>().toEqualTypeOf<
      "json" | "types" | "react" | "html"
    >();
  });

  it("GenerateTypesOptions has only an optional name", () => {
    expectTypeOf<GenerateTypesOptions>().toEqualTypeOf<{ name?: string }>();
  });

  it("GenerateReactOptions are all optional; styling is only 'none'", () => {
    expectTypeOf<RequiredKeys<GenerateReactOptions>>().toEqualTypeOf<never>();
    expectTypeOf<OptionalKeys<GenerateReactOptions>>().toEqualTypeOf<
      "name" | "typescript" | "styling"
    >();
    expectTypeOf<GenerateReactOptions["typescript"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<GenerateReactOptions["styling"]>().toEqualTypeOf<
      "none" | undefined
    >();
  });

  it("GenerateSchemaJsonOptions has only an optional pretty flag", () => {
    expectTypeOf<GenerateSchemaJsonOptions>().toEqualTypeOf<{
      pretty?: boolean;
    }>();
  });
});
