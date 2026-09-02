import { parseExportResult } from "../schema/runtime.js";
import type { TimetableParseResult } from "../schema/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = sortedValue(value[key]);
  }
  return result;
}

export function toJSON(
  result: TimetableParseResult,
  options: { readonly pretty?: boolean } = {},
): string {
  const valid = parseExportResult(result);
  const serialized = JSON.stringify(
    sortedValue(valid),
    null,
    options.pretty === true ? 2 : undefined,
  );
  return serialized ?? "null";
}
