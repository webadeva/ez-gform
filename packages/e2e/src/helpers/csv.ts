/** RFC 4180 CSV parser: quoted fields, "" escapes, commas/newlines inside quotes, CRLF or LF. */
export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\r") {
      if (text.charAt(i + 1) === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
    i++;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
};

/** Parses CSV text into records keyed by the header row. */
export const parseCsvRecords = (text: string): Record<string, string>[] => {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, idx) => {
      record[name] = cells[idx] ?? "";
    });
    return record;
  });
};
