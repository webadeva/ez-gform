import type { FormSchema, Question } from "@ez-gform/types";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchemaForm } from "../components/SchemaForm";

const makeQuestion = (overrides: Partial<Question>): Question => {
  return {
    id: "q1",
    entryId: "entry.1",
    title: "Question",
    type: "short_answer",
    required: false,
    ...overrides,
  };
};

const makeSchema = (...questions: Question[]): FormSchema => {
  return {
    formId: "1FAIpQLSfAbCdEfGhIjKlMnOpQrStUvWxYz0123456789AbCdEfGhIjK",
    title: "Test form",
    questions,
    sections: [],
    multiPage: false,
  };
};

const opts = (...values: string[]) => {
  return values.map((value) => {
    return { value, isOther: false };
  });
};

const otherOption = { value: "", isOther: true };

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(null));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Submits the form and returns the posted body as URLSearchParams. */
const submitAndRead = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<URLSearchParams> => {
  await user.click(
    screen.getByRole("button", { name: /submit to google form/i }),
  );
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return new URLSearchParams(init.body);
};

describe("SchemaForm short answer / paragraph", () => {
  it("types into a short answer input and posts the value", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(makeQuestion({ title: "Name", required: true }))}
      />,
    );
    const input = screen.getByLabelText("Name *");
    await user.type(input, "Ada");
    expect(input).toHaveValue("Ada");
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("Ada");
  });

  it("renders a textarea for paragraph questions and accepts typing", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(makeQuestion({ title: "Bio", type: "paragraph" }))}
      />,
    );
    const area = screen.getByLabelText("Bio");
    expect(area.tagName).toBe("TEXTAREA");
    await user.type(area, "line one");
    expect(area).toHaveValue("line one");
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("line one");
  });

  it("omits the required marker when the question is optional", () => {
    render(<SchemaForm schema={makeSchema(makeQuestion({ title: "Nick" }))} />);
    expect(screen.getByText("Nick")).toBeInTheDocument();
    expect(screen.queryByText("Nick *")).not.toBeInTheDocument();
  });
});

describe("SchemaForm multiple choice", () => {
  const schema = makeSchema(
    makeQuestion({
      title: "Colour",
      type: "multiple_choice",
      options: [...opts("Red", "Blue"), otherOption],
    }),
  );

  it("selects a radio option and switches between options", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    const red = screen.getByDisplayValue("Red");
    const blue = screen.getByDisplayValue("Blue");
    expect(red).not.toBeChecked();
    await user.click(red);
    expect(red).toBeChecked();
    await user.click(blue);
    expect(blue).toBeChecked();
    expect(red).not.toBeChecked();
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("Blue");
  });

  it("selects Other, types other text, then switches back to a plain option", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    const other = screen.getByLabelText("Other:");
    await user.click(other);
    expect(other).toBeChecked();
    const text = screen.getByLabelText("Other response");
    expect(text).toHaveValue("");
    await user.type(text, "Green");
    expect(text).toHaveValue("Green");
    expect(other).toBeChecked();

    await user.click(screen.getByDisplayValue("Red"));
    expect(other).not.toBeChecked();
    expect(screen.getByLabelText("Other response")).toHaveValue("");
  });

  it("posts the other response", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    await user.click(screen.getAllByRole("radio")[2]!);
    await user.type(screen.getByLabelText("Other response"), "Teal");
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("__other_option__");
    expect(body.get("entry.1.other_option_response")).toBe("Teal");
  });
});

describe("SchemaForm dropdown", () => {
  it("selects options and skips the Other option", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "Size",
            type: "dropdown",
            options: [...opts("S", "M"), otherOption],
          }),
        )}
      />,
    );
    const select = screen.getByLabelText("Size");
    expect(select).toHaveValue("");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.selectOptions(select, "M");
    expect(select).toHaveValue("M");
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("M");
  });

  it("returns to the placeholder when it is re-selected", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "Size",
            type: "dropdown",
            options: opts("S", "M"),
          }),
        )}
      />,
    );
    const select = screen.getByLabelText("Size");
    await user.selectOptions(select, "S");
    await user.selectOptions(select, "");
    expect(select).toHaveValue("");
  });
});

describe("SchemaForm checkboxes", () => {
  const schema = makeSchema(
    makeQuestion({
      title: "Toppings",
      type: "checkboxes",
      options: [...opts("Ham", "Egg"), otherOption],
    }),
  );

  it("toggles plain options on and off", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    const [ham, egg] = screen.getAllByRole("checkbox");
    await user.click(ham!);
    await user.click(egg!);
    expect(ham).toBeChecked();
    expect(egg).toBeChecked();
    await user.click(ham!);
    expect(ham).not.toBeChecked();
    expect(egg).toBeChecked();
    const body = await submitAndRead(user);
    expect(body.getAll("entry.1")).toEqual(["Egg"]);
  });

  it("adds, edits and removes the Other entry", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    const other = screen.getAllByRole("checkbox")[2]!;
    const text = screen.getByDisplayValue("");
    expect(other).not.toBeChecked();

    await user.click(other);
    expect(other).toBeChecked();
    await user.type(text, "Pine");
    expect(text).toHaveValue("Pine");
    expect(other).toBeChecked();

    await user.type(text, "apple");
    expect(text).toHaveValue("Pineapple");

    await user.click(other);
    expect(other).not.toBeChecked();
    expect(text).toHaveValue("");
  });

  it("selects Other implicitly by typing in its text box and posts it", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    await user.type(screen.getByDisplayValue(""), "Jam");
    expect(screen.getAllByRole("checkbox")[2]).toBeChecked();
    const body = await submitAndRead(user);
    expect(body.getAll("entry.1")).toEqual(["__other_option__"]);
    expect(body.get("entry.1.other_option_response")).toBe("Jam");
  });

  it("keeps the Other entry when a plain option is toggled", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    const [ham, , other] = screen.getAllByRole("checkbox");
    await user.click(other!);
    await user.type(screen.getByDisplayValue(""), "Jam");
    await user.click(ham!);
    expect(ham).toBeChecked();
    expect(other).toBeChecked();
    expect(screen.getByDisplayValue("Jam")).toBeInTheDocument();
    const body = await submitAndRead(user);
    expect(body.getAll("entry.1")).toEqual(["__other_option__", "Ham"]);
    expect(body.get("entry.1.other_option_response")).toBe("Jam");
  });
});

describe("SchemaForm linear scale", () => {
  it("renders the labelled range and selects a point", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "Rate",
            type: "linear_scale",
            scale: { min: 2, max: 4, lowLabel: "Bad", highLabel: "Good" },
          }),
        )}
      />,
    );
    expect(screen.getByText("Bad")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    await user.click(screen.getByLabelText("3"));
    expect(screen.getByLabelText("3")).toBeChecked();
    await user.click(screen.getByLabelText("4"));
    expect(screen.getByLabelText("3")).not.toBeChecked();
    const body = await submitAndRead(user);
    expect(body.get("entry.1")).toBe("4");
  });

  it("defaults to 1-5 without labels when no scale is given", () => {
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({ title: "Rate", type: "linear_scale" }),
        )}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByLabelText("1")).toBeInTheDocument();
    expect(screen.getByLabelText("5")).toBeInTheDocument();
  });
});

describe("SchemaForm date", () => {
  const dateSchema = (date?: {
    includeTime: boolean;
    includeYear: boolean;
  }) => {
    return makeSchema(makeQuestion({ title: "When", type: "date", date }));
  };

  it("leaves month/day empty when only the year is entered", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={dateSchema()} />);
    await user.type(screen.getByLabelText("Year"), "2024");
    expect(screen.getByLabelText("Year")).toHaveValue(2024);
    expect(screen.getByLabelText("Month")).toHaveValue(null);
    expect(screen.getByLabelText("Day")).toHaveValue(null);
    expect(screen.queryByLabelText("Hour")).not.toBeInTheDocument();
    const body = await submitAndRead(user);
    expect(body.get("entry.1_year")).toBe("2024");
    expect(body.has("entry.1_month")).toBe(false);
    expect(body.has("entry.1_day")).toBe(false);
  });

  it("types Month naturally after Day without a seeded value", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={dateSchema()} />);
    await user.type(screen.getByLabelText("Day"), "7");
    await user.type(screen.getByLabelText("Month"), "3");
    expect(screen.getByLabelText("Month")).toHaveValue(3);
    expect(screen.getByLabelText("Day")).toHaveValue(7);
  });

  it("updates month and day independently", async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={dateSchema()} />);
    await user.type(screen.getByLabelText("Month"), "7");
    expect(screen.getByLabelText("Month")).toHaveValue(7);
    expect(screen.getByLabelText("Day")).toHaveValue(null);
    await user.clear(screen.getByLabelText("Day"));
    await user.type(screen.getByLabelText("Day"), "9");
    expect(screen.getByLabelText("Day")).toHaveValue(9);
    expect(screen.getByLabelText("Month")).toHaveValue(7);
  });

  it("treats a required date whose parts were all cleared as unanswered", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "When",
            type: "date",
            required: true,
            date: { includeTime: false, includeYear: true },
          }),
        )}
      />,
    );
    await user.type(screen.getByLabelText("Day"), "7");
    await user.clear(screen.getByLabelText("Day"));
    await user.click(
      screen.getByRole("button", { name: /submit to google form/i }),
    );
    expect(await screen.findByText(/Missing required answer/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides Year when includeYear is false", () => {
    render(
      <SchemaForm
        schema={dateSchema({ includeTime: false, includeYear: false })}
      />,
    );
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Month")).toBeInTheDocument();
  });

  it("shows and fills Hour/Minute when includeTime is true", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={dateSchema({ includeTime: true, includeYear: true })}
      />,
    );
    await user.type(screen.getByLabelText("Hour"), "13");
    expect(screen.getByLabelText("Hour")).toHaveValue(13);
    await user.type(screen.getByLabelText("Minute"), "45");
    expect(screen.getByLabelText("Minute")).toHaveValue(45);
    expect(screen.getByLabelText("Month")).toHaveValue(null);
  });
});

describe("SchemaForm time", () => {
  it("defaults the other part to 0 and fills hour and minute", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(makeQuestion({ title: "At", type: "time" }))}
      />,
    );
    await user.type(screen.getByLabelText("Hour"), "8");
    expect(screen.getByLabelText("Hour")).toHaveValue(8);
    expect(screen.getByLabelText("Minute")).toHaveValue(0);
    await user.clear(screen.getByLabelText("Minute"));
    await user.type(screen.getByLabelText("Minute"), "30");
    expect(screen.getByLabelText("Minute")).toHaveValue(30);
    expect(screen.getByLabelText("Hour")).toHaveValue(8);
    const body = await submitAndRead(user);
    expect(body.get("entry.1_hour")).toBe("08");
    expect(body.get("entry.1_minute")).toBe("30");
  });

  it("updates the minute first and defaults hour to 0", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(makeQuestion({ title: "At", type: "time" }))}
      />,
    );
    await user.type(screen.getByLabelText("Minute"), "5");
    expect(screen.getByLabelText("Hour")).toHaveValue(0);
    expect(screen.getByLabelText("Minute")).toHaveValue(5);
  });
});

describe("SchemaForm grids", () => {
  const rows = [
    { entryId: "entry.10", label: "Row A" },
    { entryId: "entry.11", label: "Row B" },
  ];

  it("selects one radio per row in a grid", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "Grid",
            type: "grid",
            options: opts("Low", "High"),
            rows,
          }),
        )}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    await user.click(radios[0]!);
    await user.click(radios[3]!);
    expect(radios[0]).toBeChecked();
    expect(radios[3]).toBeChecked();
    await user.click(radios[1]!);
    expect(radios[1]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
    expect(radios[3]).toBeChecked();
    const body = await submitAndRead(user);
    expect(body.get("entry.10")).toBe("High");
    expect(body.get("entry.11")).toBe("High");
  });

  it("toggles checkboxes per row in a checkbox grid", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "CGrid",
            type: "checkbox_grid",
            options: opts("X", "Y"),
            rows,
          }),
        )}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(4);
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(boxes[2]!);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).toBeChecked();
    expect(boxes[2]).toBeChecked();
    expect(boxes[3]).not.toBeChecked();
    await user.click(boxes[0]!);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
    const body = await submitAndRead(user);
    expect(body.getAll("entry.10")).toEqual(["Y"]);
    expect(body.getAll("entry.11")).toEqual(["X"]);
  });

  it("renders an empty grid when rows and options are missing", () => {
    render(
      <SchemaForm
        schema={makeSchema(makeQuestion({ title: "Empty", type: "grid" }))}
      />,
    );
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("SchemaForm other branches", () => {
  it("shows the unsupported note for file_upload questions", () => {
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({ title: "Resume", type: "file_upload" }),
        )}
      />,
    );
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText(/unsupported/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("renders nothing for an unknown question type", () => {
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            title: "Mystery",
            type: "hologram" as unknown as Question["type"],
          }),
        )}
      />,
    );
    expect(screen.queryByText("Mystery")).not.toBeInTheDocument();
  });

  it("marks required questions with an asterisk on every field kind", () => {
    const required = true;
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            id: "a",
            entryId: "entry.1",
            title: "A",
            type: "multiple_choice",
            required,
            options: opts("x"),
          }),
          makeQuestion({
            id: "b",
            entryId: "entry.2",
            title: "B",
            type: "dropdown",
            required,
            options: opts("x"),
          }),
          makeQuestion({
            id: "c",
            entryId: "entry.3",
            title: "C",
            type: "checkboxes",
            required,
            options: opts("x"),
          }),
          makeQuestion({
            id: "d",
            entryId: "entry.4",
            title: "D",
            type: "linear_scale",
            required,
          }),
          makeQuestion({
            id: "e",
            entryId: "entry.5",
            title: "E",
            type: "date",
            required,
          }),
          makeQuestion({
            id: "f",
            entryId: "entry.6",
            title: "F",
            type: "time",
            required,
          }),
          makeQuestion({
            id: "g",
            entryId: "entry.7",
            title: "G",
            type: "grid",
            required,
          }),
        )}
      />,
    );
    for (const title of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(screen.getByText(`${title} *`)).toBeInTheDocument();
    }
  });

  it("falls back to the default aria-label when the schema has no title", () => {
    render(<SchemaForm schema={{ ...makeSchema(), title: "" }} />);
    expect(
      screen.getByRole("form", { name: "Google Form" }),
    ).toBeInTheDocument();
  });

  it("associates option labels with their inputs", async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={makeSchema(
          makeQuestion({
            id: "r",
            entryId: "entry.1",
            type: "multiple_choice",
            options: [...opts("Red", "Blue"), otherOption],
          }),
          makeQuestion({
            id: "c",
            entryId: "entry.2",
            type: "checkboxes",
            options: [...opts("Cat", "Dog"), otherOption],
          }),
          makeQuestion({
            id: "g",
            entryId: "entry.3",
            type: "grid",
            options: opts("Low", "High"),
            rows: [{ entryId: "entry.4", label: "Row A" }],
          }),
        )}
      />,
    );
    expect(screen.getByRole("radio", { name: "Blue" })).not.toBeChecked();
    await user.click(screen.getByLabelText("Red"));
    expect(screen.getByRole("radio", { name: "Red" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Dog" }));
    expect(screen.getByRole("checkbox", { name: "Dog" })).toBeChecked();
    expect(screen.getAllByLabelText("Other:")).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: "Row A: High" }));
    expect(screen.getByRole("radio", { name: "Row A: High" })).toBeChecked();
  });
});
