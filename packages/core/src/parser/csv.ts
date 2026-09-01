import { cleanCell, normalizeText } from "./text.js";

export type CsvRecord = {
  readonly values: readonly string[];
  readonly line: number;
  readonly charStart: number;
  readonly charEnd: number;
};

export type CsvParse =
  | {
      readonly kind: "ok";
      readonly delimiter: "," | ";" | "\t";
      readonly records: readonly CsvRecord[];
    }
  | {
      readonly kind: "invalid";
      readonly reason: "unterminated-quote" | "empty";
    };

function inferDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split("\n")[0] ?? "";
  const delimiters = [",", ";", "\t"] as const;
  const counts = delimiters.map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  counts.sort(
    (left, right) =>
      right.count - left.count || left.delimiter.localeCompare(right.delimiter),
  );
  const best = counts[0];
  if (best === undefined || best.count === 0) {
    return ",";
  }
  return best.delimiter;
}

export function parseCsv(
  text: string,
  requestedDelimiter?: "," | ";" | "\t",
): CsvParse {
  const normalized = normalizeText(text);
  if (normalized.trim().length === 0) {
    return { kind: "invalid", reason: "empty" };
  }
  const delimiter = requestedDelimiter ?? inferDelimiter(normalized);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordStartLine = 1;
  let recordStart = 0;
  let index = 0;
  const finishCell = (): void => {
    cells.push(cleanCell(cell));
    cell = "";
  };
  const finishRecord = (end: number): void => {
    finishCell();
    if (cells.some((value) => value.length > 0)) {
      records.push({
        values: [...cells],
        line: recordStartLine,
        charStart: recordStart,
        charEnd: end,
      });
    }
    cells = [];
    recordStartLine = line;
    recordStart = end + 1;
  };
  while (index < normalized.length) {
    const character = normalized[index];
    if (character === '"') {
      const next = normalized[index + 1];
      if (quoted && next === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      quoted = !quoted;
      index += 1;
      continue;
    }
    if (!quoted && character === delimiter) {
      finishCell();
      index += 1;
      continue;
    }
    if (!quoted && character === "\n") {
      finishRecord(index);
      line += 1;
      index += 1;
      continue;
    }
    cell += character;
    index += 1;
  }
  if (quoted) {
    return { kind: "invalid", reason: "unterminated-quote" };
  }
  if (cell.length > 0 || cells.length > 0) {
    finishRecord(normalized.length);
  }
  return records.length === 0
    ? { kind: "invalid", reason: "empty" }
    : { kind: "ok", delimiter, records };
}
