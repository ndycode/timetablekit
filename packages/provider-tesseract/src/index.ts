import { ProviderError } from "@ndycode/timetablekit";
import type {
  OcrPage,
  OcrProvider,
  ParseProgress,
  ProviderContext,
  RasterImage,
  TextLine,
  TextPage,
  WarningCode,
} from "@ndycode/timetablekit";

/** The stable provider identifier used by the Tesseract adapter. */
export const TESSERACT_PROVIDER_ID = "tesseract";

/** The progress data exposed by Tesseract's logger without image content. */
export type TesseractLoggerMessage = {
  readonly progress: number;
  readonly status: string;
};

/** The text-only recognition result accepted from a Tesseract worker. */
export type TesseractRecognition = {
  readonly text: string;
};

/** The worker boundary used by the provider and its deterministic test seam. */
export interface TesseractWorker {
  recognize(image: Blob): Promise<TesseractRecognition>;
  terminate(): Promise<void>;
}

/** Options passed to a worker factory. */
export type TesseractWorkerFactoryOptions = {
  readonly languages: string;
  readonly signal: AbortSignal;
  readonly logger: (message: TesseractLoggerMessage) => void;
};

/** A lazy worker factory. The default implementation imports Tesseract.js on demand. */
export type TesseractWorkerFactory = (
  options: TesseractWorkerFactoryOptions,
) => Promise<TesseractWorker>;

/** Configuration for the browser OCR provider. */
export type TesseractProviderOptions = {
  readonly languages?: string;
  readonly createWorker?: TesseractWorkerFactory;
};

/** Creates a lazy Tesseract.js OCR provider. */
export function createTesseractProvider(
  options: TesseractProviderOptions = {},
): OcrProvider {
  const languages = options.languages ?? "eng";
  const createWorker = options.createWorker ?? createWorkerWithTesseract;

  return {
    id: TESSERACT_PROVIDER_ID,
    async recognize(
      image: RasterImage,
      context: ProviderContext,
    ): Promise<OcrPage> {
      return recognizeImage(image, context, languages, createWorker);
    },
  };
}

/** Alias for `createTesseractProvider` used by the provider extension API. */
export const tesseractProvider = createTesseractProvider;

async function recognizeImage(
  image: RasterImage,
  context: ProviderContext,
  languages: string,
  createWorker: TesseractWorkerFactory,
): Promise<OcrPage> {
  validateImage(image, context);
  checkAbort(context.signal);
  context.reportProgress({
    stage: "extract",
    completed: 0,
    total: 1,
    message: "OCR worker starting.",
  });

  const workerPromise = createWorker({
    languages,
    signal: context.signal,
    logger: (message) => reportTesseractProgress(message, context),
  });
  void workerPromise.then(
    (worker) => {
      if (context.signal.aborted) {
        void terminateQuietly(worker);
      }
    },
    () => undefined,
  );

  let worker: TesseractWorker | undefined;
  let operation: "worker" | "recognition" = "worker";
  let failure: unknown;
  try {
    worker = await waitForAbort(workerPromise, context.signal);
    checkAbort(context.signal);
    operation = "recognition";
    const payload = imageBlob(image);
    const recognition = await waitForAbort(
      worker.recognize(payload),
      context.signal,
    );
    validateRecognition(recognition);
    checkAbort(context.signal);
    const page = textPage(recognition.text, image.pageNumber);
    context.reportProgress({
      stage: "extract",
      completed: 1,
      total: 1,
      message: "OCR completed locally.",
    });
    const warningCodes: readonly WarningCode[] =
      recognition.text.trim().length === 0 ? ["NO_TEXT_FOUND"] : [];
    return { providerId: TESSERACT_PROVIDER_ID, page, warningCodes };
  } catch (error) {
    failure = error;
    throw mapTesseractFailure(error, context.signal, operation);
  } finally {
    if (worker !== undefined) {
      try {
        await worker.terminate();
      } catch (error) {
        if (failure === undefined) {
          throw new ProviderError(
            TESSERACT_PROVIDER_ID,
            "FAILED",
            "OCR worker cleanup failed.",
          );
        }
      }
    }
  }
}

function validateImage(
  image: unknown,
  context: ProviderContext,
): asserts image is RasterImage {
  if (!isRecord(image)) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "INVALID_OUTPUT",
      "OCR received an invalid image.",
    );
  }
  const bytes = image["bytes"];
  const width = image["width"];
  const height = image["height"];
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength > context.limits.maxInputBytes
  ) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "OCR image exceeds the configured byte limit.",
    );
  }
  if (
    image["mimeType"] !== "image/png" &&
    image["mimeType"] !== "image/jpeg" &&
    image["mimeType"] !== "image/webp"
  ) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "UNSUPPORTED_INPUT",
      "OCR image type is not supported.",
    );
  }
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 1 ||
    height < 1
  ) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "UNSUPPORTED_INPUT",
      "OCR image dimensions are invalid.",
    );
  }
  if (
    !Number.isSafeInteger(context.limits.maxImagePixels) ||
    context.limits.maxImagePixels < 1 ||
    width > Math.floor(context.limits.maxImagePixels / height)
  ) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "RESOURCE_LIMIT",
      "OCR image exceeds the configured pixel limit.",
    );
  }
}

function imageBlob(image: RasterImage): Blob {
  const buffer = new ArrayBuffer(image.bytes.byteLength);
  new Uint8Array(buffer).set(image.bytes);
  return new Blob([buffer], { type: image.mimeType });
}

function validateRecognition(
  recognition: unknown,
): asserts recognition is TesseractRecognition {
  if (!isRecord(recognition) || typeof recognition["text"] !== "string") {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "INVALID_OUTPUT",
      "OCR worker returned invalid text output.",
    );
  }
}

function textPage(text: string, pageNumber: number | undefined): TextPage {
  const normalized = text.replace(/\r\n?/gu, "\n");
  if (normalized.trim().length === 0) {
    return pageNumber === undefined ? { lines: [] } : { pageNumber, lines: [] };
  }
  const lines: TextLine[] = [];
  let offset = 0;
  const chunks = normalized.split("\n");
  for (let index = 0; index < chunks.length; index += 1) {
    const line = chunks[index] ?? "";
    const location =
      pageNumber === undefined
        ? { line: index + 1, charStart: offset, charEnd: offset + line.length }
        : {
            page: pageNumber,
            line: index + 1,
            charStart: offset,
            charEnd: offset + line.length,
          };
    lines.push({ text: line, location });
    offset += line.length + 1;
  }
  return pageNumber === undefined ? { lines } : { pageNumber, lines };
}

function reportTesseractProgress(
  message: TesseractLoggerMessage,
  context: ProviderContext,
): void {
  if (context.signal.aborted) {
    return;
  }
  const progress = Number.isFinite(message.progress)
    ? Math.max(0, Math.min(1, message.progress))
    : 0;
  const progressValue: ParseProgress = {
    stage: "extract",
    completed: progress,
    total: 1,
    message: "OCR in progress.",
  };
  context.reportProgress(progressValue);
}

async function createWorkerWithTesseract(
  options: TesseractWorkerFactoryOptions,
): Promise<TesseractWorker> {
  let tesseract: typeof import("tesseract.js");
  try {
    tesseract = await import("tesseract.js");
  } catch {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "UNAVAILABLE",
      "Tesseract.js could not be loaded.",
    );
  }
  const worker = await tesseract.createWorker(options.languages, 1, {
    logger: (message) => {
      options.logger({ progress: message.progress, status: message.status });
    },
  });
  return {
    recognize: async (image: Blob): Promise<TesseractRecognition> => {
      const result = await worker.recognize(image);
      return { text: result.data.text };
    },
    terminate: async (): Promise<void> => {
      await worker.terminate();
    },
  };
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ProviderError(
      TESSERACT_PROVIDER_ID,
      "ABORTED",
      "OCR processing was aborted.",
    );
  }
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
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
      cleanup();
      reject(
        new ProviderError(
          TESSERACT_PROVIDER_ID,
          "ABORTED",
          "OCR processing was aborted.",
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

async function terminateQuietly(worker: TesseractWorker): Promise<void> {
  try {
    await worker.terminate();
  } catch {}
}

function mapTesseractFailure(
  error: unknown,
  signal: AbortSignal,
  operation: "worker" | "recognition",
): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }
  if (signal.aborted || errorName(error) === "AbortError") {
    return new ProviderError(
      TESSERACT_PROVIDER_ID,
      "ABORTED",
      "OCR processing was aborted.",
    );
  }
  return operation === "worker"
    ? new ProviderError(
        TESSERACT_PROVIDER_ID,
        "UNAVAILABLE",
        "Tesseract OCR worker is unavailable.",
      )
    : new ProviderError(
        TESSERACT_PROVIDER_ID,
        "FAILED",
        "Tesseract OCR failed to recognize the image.",
      );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
