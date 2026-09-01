import { parseWeekdays } from "../locale/registry.js";
import { parseLine, type Candidate, type ParsedLine } from "./row.js";
import { parseTimeRange } from "./time.js";
import { cleanCell, normalizeText } from "./text.js";
import { makeWarning } from "./warnings.js";
import type { LocaleDefinition } from "../schema/types.js";
import type { TextDocument, TextLine } from "../schema/types.js";

type GridCell = {
  readonly text: string;
  readonly index: number;
};

type GridHeader = {
  readonly columns: readonly {
    readonly index: number;
    readonly label: string;
  }[];
};

export type CandidateDocument = {
  readonly candidates: readonly Candidate[];
  readonly warnings: readonly ReturnType<typeof makeWarning>[];
};

function gridCells(text: string): readonly GridCell[] {
  if (!/[|\t]/u.test(text)) {
    return [];
  }
  return text
    .split(/\s*\|\s*|\t+/u)
    .map((value, index) => ({ text: cleanCell(value), index }));
}

function gridHeader(
  line: TextLine,
  definition: LocaleDefinition,
): GridHeader | undefined {
  const cells = gridCells(line.text);
  const columns = cells
    .filter(
      (cell) =>
        parseWeekdays(cell.text, definition).weekdays.length === 1 &&
        parseTimeRange(cell.text).kind === "none",
    )
    .map((cell) => ({ index: cell.index, label: cell.text }));
  return columns.length >= 1 && cells.length >= 3 ? { columns } : undefined;
}

function rowLocation(line: TextLine, pageNumber: number | undefined): TextLine {
  if (pageNumber === undefined) {
    return line;
  }
  return { ...line, location: { ...line.location, page: pageNumber } };
}

function parseGridRow(
  line: TextLine,
  header: GridHeader,
  definition: LocaleDefinition,
): readonly ParsedLine[] {
  const cells = gridCells(line.text);
  if (cells.length === 0) {
    return [];
  }
  const firstDayIndex = header.columns[0]?.index;
  if (firstDayIndex === undefined) {
    return [];
  }
  const base = cells
    .filter((cell) => cell.index < firstDayIndex && cell.text.length > 0)
    .map((cell) => cell.text)
    .join(" | ");
  if (base.length === 0) {
    return [];
  }
  const parsed: ParsedLine[] = [];
  for (const column of header.columns) {
    const value = cells.find((cell) => cell.index === column.index)?.text ?? "";
    if (value.length === 0) {
      continue;
    }
    const composed = `${base} | ${column.label} | ${value}`;
    const result = parseLine(
      { text: composed, location: line.location },
      definition,
    );
    if (result.candidate !== undefined || result.warnings.length > 0) {
      parsed.push(result);
    }
  }
  return parsed;
}

function looksLikeWrappedPrefix(line: string): boolean {
  const value = cleanCell(line);
  return (
    value.length > 0 &&
    !/^#(?:\s|$)/u.test(value) &&
    !/^(?:schedule|timetable|course|subject|day|date|time)\b/iu.test(value)
  );
}

function parseOrdinaryLine(
  line: TextLine,
  definition: LocaleDefinition,
): ParsedLine {
  return parseLine(line, definition);
}

export function parseDocument(
  document: TextDocument,
  definition: LocaleDefinition,
): CandidateDocument {
  const candidates: Candidate[] = [];
  const warnings: ReturnType<typeof makeWarning>[] = [];
  for (const page of document.pages) {
    const lines = page.lines;
    let activeHeader: GridHeader | undefined;
    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      if (current === undefined) {
        continue;
      }
      const located = rowLocation(current, page.pageNumber);
      const possibleHeader = gridHeader(located, definition);
      if (possibleHeader !== undefined) {
        activeHeader = possibleHeader;
        continue;
      }
      const next = lines[index + 1];
      if (
        next !== undefined &&
        looksLikeWrappedPrefix(current.text) &&
        parseLine(next, definition).candidate !== undefined &&
        parseLine(current, definition).candidate === undefined
      ) {
        const combined: TextLine = {
          text: `${normalizeText(current.text)} ${normalizeText(next.text)}`,
          location:
            next.location.charEnd === undefined
              ? located.location
              : { ...located.location, charEnd: next.location.charEnd },
        };
        const result = parseOrdinaryLine(combined, definition);
        if (result.candidate !== undefined) {
          candidates.push(result.candidate);
        } else {
          warnings.push(...result.warnings);
        }
        index += 1;
        continue;
      }
      const gridResults =
        activeHeader === undefined
          ? []
          : parseGridRow(located, activeHeader, definition);
      const results =
        gridResults.length > 0
          ? gridResults
          : [parseOrdinaryLine(located, definition)];
      for (const result of results) {
        if (result.candidate !== undefined) {
          candidates.push(result.candidate);
        } else {
          warnings.push(...result.warnings);
        }
      }
      if (cleanCell(located.text).length === 0) {
        activeHeader = undefined;
      }
    }
  }
  return { candidates, warnings };
}
