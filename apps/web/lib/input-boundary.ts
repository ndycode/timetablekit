import type { TimetableInput } from "@ndycode/timetablekit";

export const MAX_INPUT_BYTES = 2_000_000;

export type ImageDimensions = {
  readonly width: number;
  readonly height: number;
};

type FileRule = {
  readonly kind: "text" | "csv" | "image" | "pdf";
  readonly mimeTypes: readonly string[];
};

const FILE_RULES: Readonly<Record<string, FileRule>> = {
  ".txt": {
    kind: "text",
    mimeTypes: ["", "text/plain", "application/octet-stream"],
  },
  ".text": {
    kind: "text",
    mimeTypes: ["", "text/plain", "application/octet-stream"],
  },
  ".csv": {
    kind: "csv",
    mimeTypes: [
      "",
      "text/csv",
      "application/csv",
      "text/plain",
      "application/octet-stream",
    ],
  },
  ".png": { kind: "image", mimeTypes: ["image/png"] },
  ".jpg": { kind: "image", mimeTypes: ["image/jpeg", "image/jpg"] },
  ".jpeg": { kind: "image", mimeTypes: ["image/jpeg", "image/jpg"] },
  ".webp": { kind: "image", mimeTypes: ["image/webp"] },
  ".pdf": { kind: "pdf", mimeTypes: ["application/pdf"] },
};

export type FileBoundaryResult =
  | {
      readonly ok: true;
      readonly input: TimetableInput;
      readonly label: string;
    }
  | { readonly ok: false; readonly message: string };

export function readImageDimensions(
  bytes: Readonly<Uint8Array>,
  mimeType: string,
): ImageDimensions | undefined {
  if (mimeType === "image/png") return readPngDimensions(bytes);
  if (mimeType === "image/jpeg") return readJpegDimensions(bytes);
  if (mimeType === "image/webp") return readWebpDimensions(bytes);
  return undefined;
}

export function exceedsImagePixelLimit(
  dimensions: ImageDimensions,
  maxImagePixels: number,
): boolean {
  return (
    !Number.isSafeInteger(maxImagePixels) ||
    maxImagePixels < 1 ||
    dimensions.width > Math.floor(maxImagePixels / dimensions.height)
  );
}

function readPngDimensions(
  bytes: Readonly<Uint8Array>,
): ImageDimensions | undefined {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return undefined;
  }
  return validImageDimensions(
    readUint32BigEndian(bytes, 16),
    readUint32BigEndian(bytes, 20),
  );
}

function readJpegDimensions(
  bytes: Readonly<Uint8Array>,
): ImageDimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined) return undefined;
    if (marker === 0xd9 || marker === 0xda) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return undefined;
    const segmentLength = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return undefined;
    }
    if (isJpegStartOfFrame(marker) && segmentLength >= 7) {
      return validImageDimensions(
        (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0),
        (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0),
      );
    }
    offset += segmentLength;
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(
  bytes: Readonly<Uint8Array>,
): ImageDimensions | undefined {
  if (
    bytes.length < 16 ||
    textAt(bytes, 0, "RIFF") !== true ||
    textAt(bytes, 8, "WEBP") !== true
  ) {
    return undefined;
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = textAt(bytes, offset, "VP8X")
      ? "VP8X"
      : textAt(bytes, offset, "VP8L")
        ? "VP8L"
        : textAt(bytes, offset, "VP8 ")
          ? "VP8"
          : undefined;
    const chunkLength = readUint32LittleEndian(bytes, offset + 4);
    if (chunkLength === undefined) return undefined;
    if (chunkType === "VP8X" && offset + 30 <= bytes.length) {
      return validImageDimensions(
        1 +
          (bytes[offset + 24] ?? 0) +
          ((bytes[offset + 25] ?? 0) << 8) +
          ((bytes[offset + 26] ?? 0) << 16),
        1 +
          (bytes[offset + 27] ?? 0) +
          ((bytes[offset + 28] ?? 0) << 8) +
          ((bytes[offset + 29] ?? 0) << 16),
      );
    }
    if (chunkType === "VP8L" && offset + 13 <= bytes.length) {
      const signature = bytes[offset + 8];
      if (signature !== 0x2f) return undefined;
      const first = bytes[offset + 9] ?? 0;
      const second = bytes[offset + 10] ?? 0;
      const third = bytes[offset + 11] ?? 0;
      const fourth = bytes[offset + 12] ?? 0;
      return validImageDimensions(
        1 + first + ((second & 0x3f) << 8),
        1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
      );
    }
    if (chunkType === "VP8" && offset + 16 <= bytes.length) {
      const frameEnd = Math.min(bytes.length - 6, offset + 48);
      for (let index = offset + 8; index <= frameEnd; index += 1) {
        if (
          bytes[index] === 0x9d &&
          bytes[index + 1] === 0x01 &&
          bytes[index + 2] === 0x2a
        ) {
          return validImageDimensions(
            (bytes[index + 3] ?? 0) + ((bytes[index + 4] ?? 0) << 8),
            (bytes[index + 5] ?? 0) + ((bytes[index + 6] ?? 0) << 8),
          );
        }
      }
      return undefined;
    }
    const nextOffset = offset + 8 + chunkLength + (chunkLength % 2);
    if (nextOffset <= offset || nextOffset > bytes.length) return undefined;
    offset = nextOffset;
  }
  return undefined;
}

function textAt(
  bytes: Readonly<Uint8Array>,
  offset: number,
  value: string,
): boolean {
  return [...value].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function readUint32BigEndian(
  bytes: Readonly<Uint8Array>,
  offset: number,
): number | undefined {
  if (offset + 4 > bytes.length) return undefined;
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function readUint32LittleEndian(
  bytes: Readonly<Uint8Array>,
  offset: number,
): number | undefined {
  if (offset + 4 > bytes.length) return undefined;
  return (
    (bytes[offset] ?? 0) +
    (bytes[offset + 1] ?? 0) * 0x100 +
    (bytes[offset + 2] ?? 0) * 0x10000 +
    (bytes[offset + 3] ?? 0) * 0x1000000
  );
}

function validImageDimensions(
  width: number | undefined,
  height: number | undefined,
): ImageDimensions | undefined {
  return width !== undefined &&
    height !== undefined &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0
    ? { width, height }
    : undefined;
}

function extensionFor(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot < 0 ? "" : name.slice(lastDot).toLocaleLowerCase();
}

function safeFileName(name: string): string {
  const basename = name.replace(/\\/g, "/").split("/").pop() ?? "upload";
  return basename.replace(/[^a-zA-Z0-9._() -]/g, "_").slice(0, 120) || "upload";
}

export async function fileToTimetableInput(
  file: File,
): Promise<FileBoundaryResult> {
  if (file.size > MAX_INPUT_BYTES) {
    return {
      ok: false,
      message: "That file is over the 2 MB limit.",
    };
  }
  const extension = extensionFor(file.name);
  const rule = FILE_RULES[extension];
  if (rule === undefined) {
    return {
      ok: false,
      message: "Choose a TXT, CSV, image, or PDF file.",
    };
  }
  const mimeType = file.type.toLocaleLowerCase();
  if (!rule.mimeTypes.includes(mimeType)) {
    return {
      ok: false,
      message: "The file type does not match its name.",
    };
  }
  const filename = safeFileName(file.name);
  if (rule.kind === "text" || rule.kind === "csv") {
    const text = await file.text();
    return {
      ok: true,
      input:
        rule.kind === "csv"
          ? { kind: "csv", text, filename }
          : { kind: "text", text, filename },
      label: filename,
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (rule.kind === "image") {
    const imageMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
    if (
      imageMime !== "image/png" &&
      imageMime !== "image/jpeg" &&
      imageMime !== "image/webp"
    ) {
      return { ok: false, message: "That image type is not supported." };
    }
    return {
      ok: true,
      input: { kind: "image", bytes, mimeType: imageMime, filename },
      label: filename,
    };
  }
  return {
    ok: true,
    input: { kind: "pdf", bytes, mimeType: "application/pdf", filename },
    label: filename,
  };
}
