import { ProviderError } from "@ndycode/timetablekit";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  OcrProvider,
  ParseWarning,
  ProviderContext,
  RasterImage,
  SourceDescriptor,
  TextLine,
  TextPage,
  TimetableInput,
  WarningCode,
} from "@ndycode/timetablekit";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";

/** The stable provider identifier used by the PDF.js adapter. */
export const PDFJS_PROVIDER_ID = "pdfjs";

/** Failure categories specific to PDF loading and page rendering. */
export type PdfProviderCode =
  | "INVALID_PDF"
  | "PASSWORD_REQUIRED"
  | "RENDER_UNAVAILABLE"
  | "OCR_UNAVAILABLE";

/** A structured PDF.js failure that still carries the core ProviderError shape. */
export class PdfProviderError extends ProviderError {
  override readonly name = "PdfProviderError";

  constructor(
    readonly pdfCode: PdfProviderCode,
    message: string,
    providerCode: "FAILED" | "RESOURCE_LIMIT" | "UNAVAILABLE" = "FAILED",
  ) {
    super(PDFJS_PROVIDER_ID, providerCode, message);
  }
}

/** The small text-item shape consumed from PDF.js text content. */
export type PdfTextItem = {
  readonly str: string;
  readonly hasEOL?: boolean;
};

/** Options passed to an injected page renderer. */
export type PdfRenderOptions = {
  readonly scale: number;
  readonly maxImagePixels: number;
  readonly signal: AbortSignal;
};

/** The in-memory document seam used by deterministic tests and host adapters. */
export interface PdfDocument {
  readonly numPages: number;
  getTextContent(pageNumber: number): Promise<readonly PdfTextItem[]>;
  renderPage?(
    pageNumber: number,
    options: PdfRenderOptions,
  ): Promise<RasterImage>;
  destroy(): Promise<void>;
}

/** Options supplied to a PDF document loader. */
export type PdfDocumentLoadOptions = {
  readonly data: Readonly<Uint8Array>;
  readonly maxImagePixels: number;
  readonly signal: AbortSignal;
};

/** A loader seam for tests or hosts that configure PDF.js differently. */
export type PdfDocumentLoader = (
  options: PdfDocumentLoadOptions,
) => Promise<PdfDocument>;

/** Configuration for the PDF.js extraction provider. */
export type PdfJsProviderOptions = {
  readonly loadDocument?: PdfDocumentLoader;
  readonly ocrProvider?: OcrProvider;
  readonly renderScale?: number;
};

const DEFAULT_RENDER_SCALE = 1.5;

/** Creates a PDF.js extraction provider with optional scanned-page OCR handoff. */
export function createPdfJsProvider(
  options: PdfJsProviderOptions = {},
): ExtractionProvider {
  const loadDocument = options.loadDocument ?? loadPdfDocumentWithPdfJs;
  const renderScale = options.renderScale ?? DEFAULT_RENDER_SCALE;

  return {
    id: PDFJS_PROVIDER_ID,
    supports(input: TimetableInput): boolean {
      return input.kind === "pdf" && input.mimeType === "application/pdf";
    },
    async extract(
      input: TimetableInput,
      context: ProviderContext,
    ): Promise<ExtractionArtifact> {
      return extractPdf(
        input,
        context,
        loadDocument,
        options.ocrProvider,
        renderScale,
      );
    },
  };
}

/** Alias for `createPdfJsProvider` used by the provider extension API. */
export const pdfJsProvider = createPdfJsProvider;

function isPdfInput(
  input: unknown,
): input is Extract<TimetableInput, { readonly kind: "pdf" }> {
  if (!isRecord(input)) {
    return false;
  }
  return (
    input["kind"] === "pdf" &&
    input["mimeType"] === "application/pdf" &&
    input["bytes"] instanceof Uint8Array &&
    (input["filename"] === undefined || typeof input["filename"] === "string")
  );
}

async function extractPdf(
  input: TimetableInput,
  context: ProviderContext,
  loadDocument: PdfDocumentLoader,
  ocrProvider: OcrProvider | undefined,
  renderScale: number,
): Promise<ExtractionArtifact> {
  if (!isPdfInput(input)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "UNSUPPORTED_INPUT",
      "PDF.js requires application/pdf bytes.",
    );
  }
  checkAbort(context.signal);
  validateLimits(context);
  if (input.bytes.byteLength > context.limits.maxInputBytes) {
    throw new PdfProviderError(
      "INVALID_PDF",
      "PDF input exceeds the configured byte limit.",
      "RESOURCE_LIMIT",
    );
  }
  if (!Number.isFinite(renderScale) || renderScale <= 0) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "FAILED",
      "PDF render scale must be positive.",
    );
  }

  context.reportProgress({
    stage: "preflight",
    completed: 1,
    total: 1,
    message: "PDF input accepted locally.",
  });

  const data = copyBytes(input.bytes);
  let document: PdfDocument | undefined;
  let loadPromise: Promise<PdfDocument>;
  try {
    loadPromise = loadDocument({
      data,
      maxImagePixels: context.limits.maxImagePixels,
      signal: context.signal,
    });
  } catch (error) {
    throw mapPdfFailure(error, context.signal);
  }

  void loadPromise.then(
    (candidate) => {
      if (context.signal.aborted) {
        void destroyQuietly(candidate);
      }
    },
    () => undefined,
  );

  let failure: unknown;
  try {
    document = await waitForAbort(loadPromise, context.signal);
    validateDocument(document, context.limits.maxPdfPages);
    const pageCount = document.numPages;
    const source = sourceDescriptor(input, pageCount);
    const pages: TextPage[] = [];
    const warnings: ParseWarning[] = [];

    context.reportProgress({
      stage: "extract",
      completed: 0,
      total: pageCount,
      message: "Reading PDF text pages.",
    });

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      checkAbort(context.signal);
      const items = await waitForAbort(
        document.getTextContent(pageNumber),
        context.signal,
      );
      const textPage = textPageFromItems(pageNumber, items);
      let page = textPage;

      if (!hasText(textPage)) {
        if (ocrProvider === undefined) {
          warnings.push(
            pageWarning(
              "NO_TEXT_FOUND",
              pageNumber,
              "PDF page has no extractable text.",
            ),
          );
        } else if (document.renderPage === undefined) {
          throw new PdfProviderError(
            "RENDER_UNAVAILABLE",
            "Scanned PDF OCR requires a page renderer.",
            "UNAVAILABLE",
          );
        } else {
          const raster = await waitForAbort(
            document.renderPage(pageNumber, {
              scale: renderScale,
              maxImagePixels: context.limits.maxImagePixels,
              signal: context.signal,
            }),
            context.signal,
          );
          validateRaster(raster, context);
          const ocrPage = await ocrProvider.recognize(raster, context);
          page = validateOcrPage(ocrPage, pageNumber);
          for (const warningCode of ocrPage.warningCodes) {
            warnings.push(
              pageWarning(
                warningCode,
                pageNumber,
                "OCR reported a page warning.",
              ),
            );
          }
        }
      }

      pages.push(page);
      context.reportProgress({
        stage: "extract",
        completed: pageNumber,
        total: pageCount,
        message: `PDF page ${pageNumber} of ${pageCount} processed.`,
      });
    }

    return {
      providerId: PDFJS_PROVIDER_ID,
      document: { source, pages },
      warnings,
    };
  } catch (error) {
    failure = error;
    throw mapPdfFailure(error, context.signal);
  } finally {
    if (document !== undefined) {
      try {
        await document.destroy();
      } catch (error) {
        if (failure === undefined) {
          throw mapPdfFailure(error, context.signal);
        }
      }
    }
  }
}

function validateLimits(context: ProviderContext): void {
  if (
    !Number.isSafeInteger(context.limits.maxInputBytes) ||
    context.limits.maxInputBytes < 0
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "The PDF byte limit is invalid.",
    );
  }
  if (
    !Number.isSafeInteger(context.limits.maxPdfPages) ||
    context.limits.maxPdfPages < 1
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "The PDF page limit is invalid.",
    );
  }
  if (
    !Number.isSafeInteger(context.limits.maxImagePixels) ||
    context.limits.maxImagePixels < 1
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "The PDF pixel limit is invalid.",
    );
  }
}

function validateDocument(
  document: unknown,
  maxPdfPages: number,
): asserts document is PdfDocument {
  if (!isRecord(document)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF.js returned an invalid document.",
    );
  }
  const pageCount = document["numPages"];
  if (
    !Number.isSafeInteger(pageCount) ||
    typeof pageCount !== "number" ||
    pageCount < 1 ||
    typeof document["getTextContent"] !== "function" ||
    typeof document["destroy"] !== "function" ||
    (document["renderPage"] !== undefined &&
      typeof document["renderPage"] !== "function")
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF.js returned an invalid page count.",
    );
  }
  if (pageCount > maxPdfPages) {
    throw new PdfProviderError(
      "INVALID_PDF",
      "PDF has more pages than the configured limit.",
      "RESOURCE_LIMIT",
    );
  }
}

function copyBytes(bytes: Readonly<Uint8Array>): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function sourceDescriptor(
  input: Extract<TimetableInput, { readonly kind: "pdf" }>,
  pageCount: number,
): SourceDescriptor {
  const filename = sanitizeFilename(input.filename);
  const source: SourceDescriptor =
    filename === undefined
      ? { kind: "pdf", mimeType: input.mimeType }
      : { kind: "pdf", filename, mimeType: input.mimeType };
  return { ...source, pageCount };
}

function sanitizeFilename(filename: string | undefined): string | undefined {
  if (filename === undefined) {
    return undefined;
  }
  const parts = filename.split(/[\\/]/u);
  const lastPart = parts[parts.length - 1] ?? "";
  const cleaned = lastPart.replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  return cleaned.length === 0 ? undefined : cleaned.slice(0, 128);
}

function textPageFromItems(pageNumber: number, items: unknown): TextPage {
  if (!Array.isArray(items)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF.js returned invalid text content.",
    );
  }
  const lines: TextLine[] = [];
  let lineText = "";
  let offset = 0;

  for (const item of items) {
    if (!isRecord(item) || typeof item["str"] !== "string") {
      throw new ProviderError(
        PDFJS_PROVIDER_ID,
        "INVALID_OUTPUT",
        "PDF.js returned an invalid text item.",
      );
    }
    lineText = joinText(lineText, item["str"]);
    if (item["hasEOL"] === true) {
      lines.push({
        text: lineText,
        location: {
          page: pageNumber,
          charStart: offset,
          charEnd: offset + lineText.length,
        },
      });
      offset += lineText.length + 1;
      lineText = "";
    }
  }

  if (lineText.length > 0) {
    lines.push({
      text: lineText,
      location: {
        page: pageNumber,
        charStart: offset,
        charEnd: offset + lineText.length,
      },
    });
  }
  return { pageNumber, lines };
}

function joinText(current: string, next: string): string {
  if (current.length === 0 || next.length === 0) {
    return current + next;
  }
  const currentEndsWithWhitespace = /\s$/u.test(current);
  const nextStartsWithWhitespace = /^\s/u.test(next);
  return currentEndsWithWhitespace || nextStartsWithWhitespace
    ? current + next
    : `${current} ${next}`;
}

function hasText(page: TextPage): boolean {
  return page.lines.some((line) => line.text.trim().length > 0);
}

function validateRaster(
  raster: unknown,
  context: ProviderContext,
): asserts raster is RasterImage {
  if (!isRecord(raster)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF renderer returned invalid image output.",
    );
  }
  const bytes = raster["bytes"];
  if (!(bytes instanceof Uint8Array)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF renderer returned invalid image bytes.",
    );
  }
  if (bytes.byteLength > context.limits.maxInputBytes) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "Rendered PDF page exceeds the configured byte limit.",
    );
  }
  if (
    raster["mimeType"] !== "image/png" &&
    raster["mimeType"] !== "image/jpeg" &&
    raster["mimeType"] !== "image/webp"
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF renderer returned an unsupported image type.",
    );
  }
  const width = raster["width"];
  const height = raster["height"];
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 1 ||
    height < 1
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF renderer returned invalid image dimensions.",
    );
  }
  if (width > Math.floor(context.limits.maxImagePixels / height)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "Rendered PDF page exceeds the configured pixel limit.",
    );
  }
}

function validateOcrPage(ocrPage: unknown, pageNumber: number): TextPage {
  if (
    !isRecord(ocrPage) ||
    typeof ocrPage["providerId"] !== "string" ||
    !isTextPage(ocrPage["page"]) ||
    !Array.isArray(ocrPage["warningCodes"])
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "OCR provider returned invalid page output.",
    );
  }
  if (!ocrPage["warningCodes"].every(isWarningCode)) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "OCR provider returned an invalid warning code.",
    );
  }
  const page = ocrPage["page"];
  return page.pageNumber === pageNumber
    ? page
    : { pageNumber, lines: page.lines };
}

function isTextPage(value: unknown): value is TextPage {
  if (!isRecord(value) || !Array.isArray(value["lines"])) {
    return false;
  }
  return (
    (value["pageNumber"] === undefined ||
      Number.isSafeInteger(value["pageNumber"])) &&
    value["lines"].every((line) => {
      if (
        !isRecord(line) ||
        typeof line["text"] !== "string" ||
        !isSourceLocation(line["location"])
      ) {
        return false;
      }
      return true;
    })
  );
}

function isSourceLocation(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const bounds = value["bounds"];
  return (
    (value["page"] === undefined || Number.isSafeInteger(value["page"])) &&
    (value["line"] === undefined || Number.isSafeInteger(value["line"])) &&
    (value["charStart"] === undefined ||
      Number.isSafeInteger(value["charStart"])) &&
    (value["charEnd"] === undefined ||
      Number.isSafeInteger(value["charEnd"])) &&
    (bounds === undefined ||
      (isRecord(bounds) &&
        typeof bounds["x"] === "number" &&
        typeof bounds["y"] === "number" &&
        typeof bounds["width"] === "number" &&
        typeof bounds["height"] === "number"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWarningCode(value: unknown): value is WarningCode {
  return (
    value === "UNSUPPORTED_FILE_TYPE" ||
    value === "UNRECOGNIZED_CSV" ||
    value === "FILE_TOO_LARGE" ||
    value === "TOO_MANY_PAGES" ||
    value === "NO_TEXT_FOUND" ||
    value === "LOW_CONFIDENCE" ||
    value === "UNKNOWN_DAY_LABEL" ||
    value === "UNKNOWN_LOCALE" ||
    value === "AMBIGUOUS_TIME" ||
    value === "MISSING_TITLE" ||
    value === "MISSING_START_TIME" ||
    value === "MISSING_END_TIME" ||
    value === "INVALID_TIME_RANGE" ||
    value === "INVALID_DATE" ||
    value === "INVALID_TERM_RANGE" ||
    value === "INVALID_TIMEZONE" ||
    value === "DUPLICATE_EVENT" ||
    value === "POSSIBLE_DUPLICATE" ||
    value === "SCHEDULE_CONFLICT" ||
    value === "OUTSIDE_TERM_RANGE" ||
    value === "OCR_PARTIAL" ||
    value === "UNSUPPORTED_PROVIDER" ||
    value === "PROVIDER_FAILED" ||
    value === "PROVIDER_ABORTED" ||
    value === "PROVIDER_TIMEOUT" ||
    value === "PROVIDER_OUTPUT_INVALID" ||
    value === "AI_PROVIDER_UNAVAILABLE" ||
    value === "AI_RECOVERY_SKIPPED" ||
    value === "AI_OUTPUT_INVALID"
  );
}

function pageWarning(
  code: WarningCode,
  pageNumber: number,
  message: string,
): ParseWarning {
  return {
    code,
    severity:
      code === "NO_TEXT_FOUND" || code === "OCR_PARTIAL" ? "warning" : "info",
    message,
    source: { page: pageNumber },
  };
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "ABORTED",
      "PDF processing was aborted.",
    );
  }
}

function waitForAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      signal.removeEventListener("abort", abort);
    };
    const abort = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        onAbort?.();
      } catch {}
      cleanup();
      reject(
        new ProviderError(
          PDFJS_PROVIDER_ID,
          "ABORTED",
          "PDF processing was aborted.",
        ),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

async function destroyQuietly(document: PdfDocument): Promise<void> {
  try {
    await document.destroy();
  } catch {}
}

function mapPdfFailure(error: unknown, signal: AbortSignal): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }
  if (signal.aborted || errorName(error) === "AbortError") {
    return new ProviderError(
      PDFJS_PROVIDER_ID,
      "ABORTED",
      "PDF processing was aborted.",
    );
  }
  const name = errorName(error);
  if (name === "PasswordException" || name === "PasswordError") {
    return new PdfProviderError(
      "PASSWORD_REQUIRED",
      "Password-protected PDFs are not supported.",
    );
  }
  return new PdfProviderError("INVALID_PDF", "The PDF could not be read.");
}

function errorName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }
  if (isRecord(error) && typeof error["name"] === "string") {
    return error["name"];
  }
  return undefined;
}

async function loadPdfDocumentWithPdfJs(
  options: PdfDocumentLoadOptions,
): Promise<PdfDocument> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new PdfProviderError(
      "RENDER_UNAVAILABLE",
      "PDF.js could not be loaded.",
      "UNAVAILABLE",
    );
  }

  let task: PDFDocumentLoadingTask | undefined;
  let loadedDocument: PDFDocumentProxy | undefined;
  let taskCleanup: Promise<void> | undefined;
  const destroyTask = (): Promise<void> => {
    if (taskCleanup !== undefined) {
      return taskCleanup;
    }
    taskCleanup =
      task === undefined
        ? Promise.resolve()
        : task.destroy().catch(() => undefined);
    return taskCleanup;
  };

  try {
    task = pdfjs.getDocument({
      data: options.data,
      disableAutoFetch: true,
      disableStream: true,
      enableXfa: false,
      maxImageSize: options.maxImagePixels,
      stopAtErrors: true,
    });
    loadedDocument = await waitForAbort(task.promise, options.signal, () => {
      void destroyTask();
    });
    return createPdfDocument(
      loadedDocument,
      options.signal,
      options.maxImagePixels,
      destroyTask,
    );
  } catch (error) {
    throw mapPdfFailure(error, options.signal);
  } finally {
    if (loadedDocument === undefined) {
      await destroyTask();
    }
  }
}

function createPdfDocument(
  document: PDFDocumentProxy,
  signal: AbortSignal,
  maxImagePixels: number,
  destroyDocument: () => Promise<void>,
): PdfDocument {
  return {
    numPages: document.numPages,
    async getTextContent(pageNumber: number): Promise<readonly PdfTextItem[]> {
      checkAbort(signal);
      const page = await waitForAbort(document.getPage(pageNumber), signal);
      const content = await waitForAbort(
        page.getTextContent({ includeMarkedContent: false }),
        signal,
      );
      return mapPdfTextContent(content);
    },
    async renderPage(
      pageNumber: number,
      renderOptions: PdfRenderOptions,
    ): Promise<RasterImage> {
      checkAbort(signal);
      if (renderOptions.maxImagePixels > maxImagePixels) {
        throw new ProviderError(
          PDFJS_PROVIDER_ID,
          "RESOURCE_LIMIT",
          "Render pixel limit cannot exceed the document limit.",
        );
      }
      const page = await waitForAbort(document.getPage(pageNumber), signal);
      return renderPdfPage(page, pageNumber, renderOptions);
    },
    destroy(): Promise<void> {
      return destroyDocument();
    },
  };
}

function mapPdfTextContent(content: unknown): readonly PdfTextItem[] {
  if (!isRecord(content) || !Array.isArray(content["items"])) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "INVALID_OUTPUT",
      "PDF.js returned invalid text content.",
    );
  }
  const items: PdfTextItem[] = [];
  for (const item of content["items"]) {
    if (isRecord(item) && typeof item["str"] === "string") {
      const hasEOL = item["hasEOL"];
      items.push({ str: item["str"], hasEOL: hasEOL === true });
    }
  }
  return items;
}

async function renderPdfPage(
  page: PDFPageProxy,
  pageNumber: number,
  options: PdfRenderOptions,
): Promise<RasterImage> {
  if (typeof document === "undefined") {
    throw new PdfProviderError(
      "RENDER_UNAVAILABLE",
      "PDF page rendering requires a browser canvas.",
      "UNAVAILABLE",
    );
  }
  const viewport = page.getViewport({ scale: options.scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > Math.floor(options.maxImagePixels / height)
  ) {
    throw new ProviderError(
      PDFJS_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "Rendered PDF page exceeds the configured pixel limit.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasContext = canvas.getContext("2d");
  if (canvasContext === null) {
    throw new PdfProviderError(
      "RENDER_UNAVAILABLE",
      "The browser does not provide a 2D canvas.",
      "UNAVAILABLE",
    );
  }

  let renderTask: RenderTask | undefined;
  try {
    renderTask = page.render({ canvas: null, canvasContext, viewport });
    await waitForAbort(renderTask.promise, options.signal, () => {
      renderTask?.cancel();
    });
    const blob = await canvasToBlob(canvas);
    const bytes = new Uint8Array(
      await waitForAbort(blob.arrayBuffer(), options.signal),
    );
    return { bytes, mimeType: "image/png", width, height, pageNumber };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(
          new PdfProviderError(
            "RENDER_UNAVAILABLE",
            "The browser could not encode the PDF page.",
            "UNAVAILABLE",
          ),
        );
      } else {
        resolve(blob);
      }
    }, "image/png");
  });
}
