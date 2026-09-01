import { describe, expect, it } from "vitest";
import type {
  OcrProvider,
  ParseProgress,
  ProviderContext,
  RasterImage,
  ResourceLimits,
  TimetableInput,
} from "@ndycode/timetablekit";
import {
  createPdfJsProvider,
  type PdfDocument,
  type PdfDocumentLoadOptions,
  type PdfDocumentLoader,
} from "../src/index.js";

const defaultLimits: ResourceLimits = {
  maxInputBytes: 10_000,
  maxImagePixels: 10_000,
  maxPdfPages: 10,
  timeoutMs: 1_000,
  maxOutputBytes: 10_000,
};

function contextFor(
  options: {
    readonly signal?: AbortSignal;
    readonly limits?: Partial<ResourceLimits>;
  } = {},
): { readonly context: ProviderContext; readonly progress: ParseProgress[] } {
  const progress: ParseProgress[] = [];
  return {
    context: {
      signal: options.signal ?? new AbortController().signal,
      limits: { ...defaultLimits, ...options.limits },
      reportProgress: (value) => progress.push(value),
    },
    progress,
  };
}

function pdfInput(
  bytes: Readonly<Uint8Array> = new Uint8Array([1, 2, 3]),
  filename?: string,
): TimetableInput {
  return filename === undefined
    ? { kind: "pdf", bytes, mimeType: "application/pdf" }
    : { kind: "pdf", bytes, mimeType: "application/pdf", filename };
}

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  const resolvers: Array<(value: T) => void> = [];
  const promise = new Promise<T>((resolve) => {
    resolvers.push(resolve);
  });
  const resolve = resolvers[0];
  if (resolve === undefined) {
    throw new Error("Deferred resolver was not created.");
  }
  return { promise, resolve };
}

describe("PDF.js provider contract", () => {
  it("extracts text through the injected loader and reports bounded progress", async () => {
    const inputBytes = new Uint8Array([1, 2, 3]);
    const input = pdfInput(inputBytes, "/private/schedule.pdf");
    let loadOptions: PdfDocumentLoadOptions | undefined;
    let destroyed = 0;
    const document: PdfDocument = {
      numPages: 1,
      getTextContent: async (pageNumber) => {
        expect(pageNumber).toBe(1);
        return [
          { str: "Calculus" },
          { str: "Monday", hasEOL: true },
          { str: "09:00-10:30" },
        ];
      },
      destroy: async () => {
        destroyed += 1;
      },
    };
    const loadDocument: PdfDocumentLoader = async (options) => {
      loadOptions = options;
      return document;
    };
    const { context, progress } = contextFor();
    const provider = createPdfJsProvider({ loadDocument });

    expect(provider.id).toBe("pdfjs");
    expect(provider.supports(input)).toBe(true);
    expect(provider.supports({ kind: "text", text: "not a PDF" })).toBe(false);

    const artifact = await provider.extract(input, context);

    expect(loadOptions).toBeDefined();
    if (loadOptions === undefined) return;
    expect(loadOptions.data).toEqual(inputBytes);
    expect(loadOptions.data).not.toBe(inputBytes);
    expect(loadOptions.maxImagePixels).toBe(defaultLimits.maxImagePixels);
    expect(loadOptions.signal).toBe(context.signal);
    expect(artifact).toEqual({
      providerId: "pdfjs",
      document: {
        source: {
          kind: "pdf",
          filename: "schedule.pdf",
          mimeType: "application/pdf",
          pageCount: 1,
        },
        pages: [
          {
            pageNumber: 1,
            lines: [
              {
                text: "Calculus Monday",
                location: { page: 1, charStart: 0, charEnd: 15 },
              },
              {
                text: "09:00-10:30",
                location: { page: 1, charStart: 16, charEnd: 27 },
              },
            ],
          },
        ],
      },
      warnings: [],
    });
    expect(progress).toEqual([
      {
        stage: "preflight",
        completed: 1,
        total: 1,
        message: "PDF input accepted locally.",
      },
      {
        stage: "extract",
        completed: 0,
        total: 1,
        message: "Reading PDF text pages.",
      },
      {
        stage: "extract",
        completed: 1,
        total: 1,
        message: "PDF page 1 of 1 processed.",
      },
    ]);
    expect(destroyed).toBe(1);
  });

  it("renders scanned pages through the injected OCR provider", async () => {
    let renderOptions:
      | {
          readonly scale: number;
          readonly maxImagePixels: number;
          readonly signal: AbortSignal;
        }
      | undefined;
    let destroyed = 0;
    const raster: RasterImage = {
      bytes: new Uint8Array([9, 8, 7]),
      mimeType: "image/png",
      width: 2,
      height: 2,
      pageNumber: 1,
    };
    const document: PdfDocument = {
      numPages: 1,
      getTextContent: async () => [],
      renderPage: async (pageNumber, options) => {
        expect(pageNumber).toBe(1);
        renderOptions = options;
        return raster;
      },
      destroy: async () => {
        destroyed += 1;
      },
    };
    const ocrProvider: OcrProvider = {
      id: "test-ocr",
      recognize: async (image, context) => {
        expect(image).toBe(raster);
        expect(context.signal).toBe(renderOptions?.signal);
        return {
          providerId: "test-ocr",
          page: {
            pageNumber: 99,
            lines: [
              {
                text: "Recovered text",
                location: { page: 99, line: 1, charStart: 0, charEnd: 14 },
              },
            ],
          },
          warningCodes: ["OCR_PARTIAL"],
        };
      },
    };
    const { context } = contextFor({ limits: { maxImagePixels: 4 } });
    const provider = createPdfJsProvider({
      loadDocument: async () => document,
      ocrProvider,
      renderScale: 2,
    });

    const artifact = await provider.extract(pdfInput(), context);

    expect(renderOptions).toMatchObject({
      scale: 2,
      maxImagePixels: 4,
      signal: context.signal,
    });
    expect(artifact.document.pages[0]?.lines[0]?.text).toBe("Recovered text");
    expect(artifact.document.pages[0]?.pageNumber).toBe(1);
    expect(artifact.warnings).toEqual([
      {
        code: "OCR_PARTIAL",
        severity: "warning",
        message: "OCR reported a page warning.",
        source: { page: 1 },
      },
    ]);
    expect(destroyed).toBe(1);
  });

  it("aborts a pending load and destroys a document that resolves afterward", async () => {
    const controller = new AbortController();
    const loading = deferred<PdfDocument>();
    const cleanupFinished = deferred<void>();
    let loadOptions: PdfDocumentLoadOptions | undefined;
    let destroyed = 0;
    const document: PdfDocument = {
      numPages: 1,
      getTextContent: async () => [],
      destroy: async () => {
        destroyed += 1;
        cleanupFinished.resolve();
      },
    };
    const provider = createPdfJsProvider({
      loadDocument: async (options) => {
        loadOptions = options;
        return loading.promise;
      },
    });
    const extraction = provider.extract(
      pdfInput(),
      contextFor({ signal: controller.signal }).context,
    );

    controller.abort();

    await expect(extraction).rejects.toMatchObject({ providerCode: "ABORTED" });
    expect(loadOptions?.signal).toBe(controller.signal);
    loading.resolve(document);
    await cleanupFinished.promise;
    expect(destroyed).toBe(1);
  });

  it("rejects malformed loader output and still cleans up the document", async () => {
    let destroyed = 0;
    const document: PdfDocument = {
      numPages: 1,
      getTextContent: async () => [],
      destroy: async () => {
        destroyed += 1;
      },
    };
    Reflect.deleteProperty(document, "getTextContent");
    const provider = createPdfJsProvider({
      loadDocument: async () => document,
    });

    await expect(
      provider.extract(pdfInput(), contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "INVALID_OUTPUT",
    });
    expect(destroyed).toBe(1);
  });

  it("enforces byte, page, and rendered-pixel limits", async () => {
    let loadCount = 0;
    const pageLimitedDocument: PdfDocument = {
      numPages: 2,
      getTextContent: async () => [],
      destroy: async () => undefined,
    };
    const provider = createPdfJsProvider({
      loadDocument: async () => {
        loadCount += 1;
        return pageLimitedDocument;
      },
    });

    await expect(
      provider.extract(
        pdfInput(new Uint8Array([1, 2, 3])),
        contextFor({ limits: { maxInputBytes: 2 } }).context,
      ),
    ).rejects.toMatchObject({
      providerCode: "RESOURCE_LIMIT",
      pdfCode: "INVALID_PDF",
    });
    expect(loadCount).toBe(0);

    await expect(
      provider.extract(
        pdfInput(),
        contextFor({ limits: { maxPdfPages: 1 } }).context,
      ),
    ).rejects.toMatchObject({
      providerCode: "RESOURCE_LIMIT",
      pdfCode: "INVALID_PDF",
    });

    const pixelLimitedDocument: PdfDocument = {
      numPages: 1,
      getTextContent: async () => [],
      renderPage: async () => ({
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        width: 2,
        height: 2,
      }),
      destroy: async () => undefined,
    };
    const pixelProvider = createPdfJsProvider({
      loadDocument: async () => pixelLimitedDocument,
      ocrProvider: {
        id: "test-ocr",
        recognize: async () => ({
          providerId: "test-ocr",
          page: { lines: [] },
          warningCodes: [],
        }),
      },
    });

    await expect(
      pixelProvider.extract(
        pdfInput(),
        contextFor({ limits: { maxImagePixels: 3 } }).context,
      ),
    ).rejects.toMatchObject({ providerCode: "RESOURCE_LIMIT" });
  });
});
