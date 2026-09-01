import type { TimetableInput } from "@ndycode/timetablekit";

export const MAX_INPUT_BYTES = 2_000_000;

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
      message: "That file is larger than the 2 MB browser limit.",
    };
  }
  const extension = extensionFor(file.name);
  const rule = FILE_RULES[extension];
  if (rule === undefined) {
    return {
      ok: false,
      message: "Use a TXT, CSV, PNG, JPEG, WebP, or PDF file.",
    };
  }
  const mimeType = file.type.toLocaleLowerCase();
  if (!rule.mimeTypes.includes(mimeType)) {
    return {
      ok: false,
      message: "The file extension and MIME type do not match.",
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
      return { ok: false, message: "That image MIME type is not supported." };
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
