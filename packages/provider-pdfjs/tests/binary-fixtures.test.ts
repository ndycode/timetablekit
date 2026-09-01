import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTimetableParser, parseTimetable } from "@ndycode/timetablekit";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  OcrProvider,
  ProviderContext,
  RasterImage,
  TimetableInput,
} from "@ndycode/timetablekit";
import { allFixtureDefinitions } from "../../../scripts/generate-fixtures.mjs";
import {
  createTesseractProvider,
  type TesseractWorker,
} from "../../provider-tesseract/src/index.js";
import { createPdfJsProvider, type PdfDocument } from "../src/index.js";

const fixturesRoot = fileURLToPath(
  new URL("../../../fixtures/", import.meta.url),
);
const defaultLimits = {
  maxInputBytes: 2_000_000,
  maxImagePixels: 4_000_000,
  maxPdfPages: 10,
  timeoutMs: 15_000,
  maxOutputBytes: 4_000_000,
};

type Manifest = {
  readonly id: string;
  readonly kind: "image" | "pdf";
  readonly input: string;
  readonly expected: string;
  readonly filename: string;
  readonly options: {
    readonly locale: string;
    readonly timezone: string;
    readonly evidence?: "none" | "locations" | "snippets";
    readonly term?: { readonly startsOn: string; readonly endsOn: string };
  };
  readonly artifact: "image-grid" | "image-list" | "pdf-text" | "pdf-scanned";
  readonly pageCount?: number;
};

type Expected = {
  readonly source: Record<string, unknown>;
  readonly timezone: string;
  readonly locale: string;
  readonly events: readonly Record<string, unknown>[];
  readonly warningCodes: readonly string[];
  readonly conflicts: readonly Record<string, unknown>[];
};

const definitionsById = new Map(
  allFixtureDefinitions.map((definition) => [definition.id, definition]),
);

function eventShape(event: {
  readonly title: string;
  readonly schedule: unknown;
  readonly startTime: string;
  readonly endTime: string;
  readonly timezone: string;
  readonly code?: string;
  readonly eventType?: string;
  readonly location?: string;
  readonly instructor?: string;
  readonly notes?: string;
}): Record<string, unknown> {
  const shape: Record<string, unknown> = {
    title: event.title,
    schedule: event.schedule,
    startTime: event.startTime,
    endTime: event.endTime,
    timezone: event.timezone,
  };
  for (const field of [
    "code",
    "eventType",
    "location",
    "instructor",
    "notes",
  ] as const) {
    const value = event[field];
    if (value !== undefined) shape[field] = value;
  }
  return shape;
}

function sortedJson(values: readonly unknown[]): readonly unknown[] {
  return [...values].sort((left, right) =>
    (JSON.stringify(left) ?? "").localeCompare(JSON.stringify(right) ?? ""),
  );
}

async function manifestsFor(
  artifact: Manifest["artifact"],
): Promise<readonly Manifest[]> {
  const names = (await readdir(resolve(fixturesRoot, "manifests")))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const manifests: Manifest[] = [];
  for (const name of names) {
    const manifest = JSON.parse(
      await readFile(resolve(fixturesRoot, "manifests", name), "utf8"),
    ) as Manifest;
    if (manifest.artifact === artifact) manifests.push(manifest);
  }
  return manifests;
}

async function expectedFor(manifest: Manifest): Promise<Expected> {
  return JSON.parse(
    await readFile(resolve(fixturesRoot, manifest.expected), "utf8"),
  ) as Expected;
}

function contextFor(signal = new AbortController().signal): ProviderContext {
  return {
    signal,
    limits: defaultLimits,
    reportProgress: () => undefined,
  };
}

function sourceTextFor(manifest: Manifest, pageNumber = 1): string {
  const definition = definitionsById.get(manifest.id);
  if (definition === undefined)
    throw new Error(`Missing generated definition for ${manifest.id}`);
  if (Array.isArray(definition.sourceText))
    return definition.sourceText[pageNumber - 1] ?? "";
  return definition.sourceText;
}

function ocrPage(
  text: string,
  pageNumber: number | undefined,
): {
  readonly pageNumber?: number;
  readonly lines: readonly [
    {
      readonly text: string;
      readonly location: {
        readonly page?: number;
        readonly line: number;
        readonly charStart: number;
        readonly charEnd: number;
      };
    },
  ];
} {
  const line = {
    text,
    location:
      pageNumber === undefined
        ? { line: 1, charStart: 0, charEnd: text.length }
        : { page: pageNumber, line: 1, charStart: 0, charEnd: text.length },
  };
  return pageNumber === undefined
    ? { lines: [line] }
    : { pageNumber, lines: [line] };
}

function imageExtractionProvider(ocr: OcrProvider): ExtractionProvider {
  return {
    id: "fixture-image-ocr",
    supports: (input) => input.kind === "image",
    async extract(input, context): Promise<ExtractionArtifact> {
      if (input.kind !== "image") throw new Error("Expected image input");
      const filename = input.filename ?? "";
      const recognized = await ocr.recognize(
        {
          bytes: input.bytes,
          mimeType: input.mimeType,
          width: 1200,
          height: 420,
        },
        context,
      );
      const source = {
        kind: "image" as const,
        mimeType: input.mimeType,
        filename,
      };
      return {
        providerId: recognized.providerId,
        document: { source, pages: [recognized.page] },
        warnings: recognized.warningCodes.map((code) => ({
          code,
          severity: "warning" as const,
          message: "Synthetic OCR fixture warning.",
        })),
      };
    },
  };
}

function assertExpected(
  result: Awaited<ReturnType<typeof parseTimetable>>,
  expected: Expected,
): void {
  expect({
    source: result.source,
    timezone: result.timezone,
    locale: result.locale,
  }).toEqual({
    source: expected.source,
    timezone: expected.timezone,
    locale: expected.locale,
  });
  expect(sortedJson(result.events.map(eventShape))).toEqual(
    sortedJson(expected.events),
  );
  expect(result.warnings.map((warning) => warning.code).sort()).toEqual(
    [...expected.warningCodes].sort(),
  );
  expect(
    sortedJson(
      result.conflicts.map((conflict) => ({
        occurrence: conflict.occurrence,
        overlap: conflict.overlap,
      })),
    ),
  ).toEqual(sortedJson(expected.conflicts));
}

describe("binary fixture integration", () => {
  it("parses every text-based PDF fixture through PDF.js", async () => {
    const manifests = await manifestsFor("pdf-text");
    expect(manifests).toHaveLength(5);
    for (const manifest of manifests) {
      const bytes = new Uint8Array(
        await readFile(resolve(fixturesRoot, manifest.input)),
      );
      const result = await createTimetableParser({
        providers: [createPdfJsProvider()],
      }).parse(
        {
          kind: "pdf",
          bytes,
          mimeType: "application/pdf",
          filename: manifest.filename,
        },
        manifest.options,
      );
      assertExpected(result, await expectedFor(manifest));
    }
  });

  it("parses every scanned PDF fixture through the OCR handoff", async () => {
    const manifests = await manifestsFor("pdf-scanned");
    expect(manifests).toHaveLength(3);
    for (const manifest of manifests) {
      const bytes = new Uint8Array(
        await readFile(resolve(fixturesRoot, manifest.input)),
      );
      const document: PdfDocument = {
        numPages: manifest.pageCount ?? 1,
        getTextContent: async () => [],
        renderPage: async (pageNumber): Promise<RasterImage> => ({
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "image/png",
          width: 100,
          height: 100,
          pageNumber,
        }),
        destroy: async () => undefined,
      };
      const ocrProvider: OcrProvider = {
        id: "fixture-pdf-ocr",
        recognize: async (image) => ({
          providerId: "fixture-pdf-ocr",
          page: ocrPage(
            sourceTextFor(manifest, image.pageNumber),
            image.pageNumber,
          ),
          warningCodes: [],
        }),
      };
      const result = await createTimetableParser({
        providers: [
          createPdfJsProvider({
            loadDocument: async () => document,
            ocrProvider,
          }),
        ],
      }).parse(
        {
          kind: "pdf",
          bytes,
          mimeType: "application/pdf",
          filename: manifest.filename,
        },
        manifest.options,
      );
      assertExpected(result, await expectedFor(manifest));
    }
  });

  it("parses every image fixture through the local OCR provider", async () => {
    const manifests = [
      ...(await manifestsFor("image-grid")),
      ...(await manifestsFor("image-list")),
    ];
    expect(manifests).toHaveLength(10);
    const textByFilename = new Map(
      manifests.map((manifest) => [manifest.filename, sourceTextFor(manifest)]),
    );
    let currentFilename = "";
    const worker: TesseractWorker = {
      recognize: async () => ({
        text: textByFilename.get(currentFilename) ?? "",
      }),
      terminate: async () => undefined,
    };
    const ocr = createTesseractProvider({ createWorker: async () => worker });
    for (const manifest of manifests) {
      currentFilename = manifest.filename;
      const bytes = new Uint8Array(
        await readFile(resolve(fixturesRoot, manifest.input)),
      );
      const input: TimetableInput = {
        kind: "image",
        bytes,
        mimeType: "image/png",
        filename: manifest.filename,
      };
      const provider = imageExtractionProvider(ocr);
      const result = await createTimetableParser({
        providers: [provider],
      }).parse(input, manifest.options);
      assertExpected(result, await expectedFor(manifest));
    }
  });
});
