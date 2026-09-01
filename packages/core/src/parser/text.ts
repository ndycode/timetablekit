import type {
  FieldEvidence,
  SourceDescriptor,
  SourceLocation,
} from "../schema/types.js";

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\r\n?/g, "\n");
}

export function cleanCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeFilename(
  filename: string | undefined,
): string | undefined {
  if (filename === undefined) {
    return undefined;
  }
  const basename = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const safe = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._()\- ]/g, "_")
    .replace(/^\.+/, "")
    .trim();
  return safe.length > 0 ? safe.slice(0, 160) : undefined;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function sourceLocationForLine(
  line: number,
  text: string,
): SourceLocation {
  return { line, charStart: 0, charEnd: text.length };
}

export function makeEvidence(
  source: SourceDescriptor,
  location: SourceLocation,
  mode: "none" | "locations" | "snippets",
  sourceText: string,
): FieldEvidence | undefined {
  if (mode === "none") {
    return undefined;
  }
  if (mode === "locations") {
    return { source, location };
  }
  return { source, location, excerpt: sourceText.slice(0, 160) };
}

export function addEvidence(
  target: Partial<Record<string, readonly FieldEvidence[]>>,
  field: string,
  evidence: FieldEvidence | undefined,
): void {
  if (evidence === undefined) {
    return;
  }
  const previous = target[field];
  target[field] = previous === undefined ? [evidence] : [...previous, evidence];
}

export function lineStartOffsets(text: string): readonly number[] {
  const offsets: number[] = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}
