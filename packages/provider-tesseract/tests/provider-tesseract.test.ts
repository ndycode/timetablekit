import { describe, expect, it } from "vitest";
import type {
  ParseProgress,
  ProviderContext,
  RasterImage,
  ResourceLimits,
} from "@ndycode/timetablekit";
import {
  createTesseractProvider,
  type TesseractRecognition,
  type TesseractWorker,
  type TesseractWorkerFactory,
  type TesseractWorkerFactoryOptions,
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

const image: RasterImage = {
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png",
  width: 2,
  height: 2,
  pageNumber: 4,
};

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

describe("Tesseract provider contract", () => {
  it("recognizes an image with the injected worker and reports progress", async () => {
    let factoryOptions: TesseractWorkerFactoryOptions | undefined;
    let receivedImage: Blob | undefined;
    let terminated = 0;
    const worker: TesseractWorker = {
      recognize: async (payload) => {
        receivedImage = payload;
        return { text: "Math\r\nMonday" };
      },
      terminate: async () => {
        terminated += 1;
      },
    };
    const createWorker: TesseractWorkerFactory = async (options) => {
      factoryOptions = options;
      options.logger({ progress: 0.4, status: "recognizing" });
      return worker;
    };
    const { context, progress } = contextFor();
    const provider = createTesseractProvider({
      languages: "eng+spa",
      createWorker,
    });

    expect(provider.id).toBe("tesseract");
    const result = await provider.recognize(image, context);

    expect(factoryOptions).toBeDefined();
    if (factoryOptions === undefined) return;
    expect(factoryOptions.languages).toBe("eng+spa");
    expect(factoryOptions.signal).toBe(context.signal);
    expect(receivedImage).toBeDefined();
    if (receivedImage === undefined) return;
    expect(receivedImage.type).toBe("image/png");
    expect(new Uint8Array(await receivedImage.arrayBuffer())).toEqual(
      image.bytes,
    );
    expect(result).toEqual({
      providerId: "tesseract",
      page: {
        pageNumber: 4,
        lines: [
          {
            text: "Math",
            location: { page: 4, line: 1, charStart: 0, charEnd: 4 },
          },
          {
            text: "Monday",
            location: { page: 4, line: 2, charStart: 5, charEnd: 11 },
          },
        ],
      },
      warningCodes: [],
    });
    expect(progress).toEqual([
      {
        stage: "extract",
        completed: 0,
        total: 1,
        message: "OCR worker starting.",
      },
      {
        stage: "extract",
        completed: 0.4,
        total: 1,
        message: "OCR in progress.",
      },
      {
        stage: "extract",
        completed: 1,
        total: 1,
        message: "OCR completed locally.",
      },
    ]);
    expect(terminated).toBe(1);
  });

  it("aborts recognition and terminates the worker", async () => {
    const controller = new AbortController();
    const recognition = deferred<TesseractRecognition>();
    const recognitionStarted = deferred<void>();
    let terminated = 0;
    const worker: TesseractWorker = {
      recognize: async () => {
        recognitionStarted.resolve();
        return recognition.promise;
      },
      terminate: async () => {
        terminated += 1;
      },
    };
    let factoryOptions: TesseractWorkerFactoryOptions | undefined;
    const provider = createTesseractProvider({
      createWorker: async (options) => {
        factoryOptions = options;
        return worker;
      },
    });
    const extraction = provider.recognize(
      image,
      contextFor({ signal: controller.signal }).context,
    );

    await recognitionStarted.promise;
    controller.abort();

    await expect(extraction).rejects.toMatchObject({ providerCode: "ABORTED" });
    expect(factoryOptions?.signal).toBe(controller.signal);
    expect(terminated).toBe(1);
    recognition.resolve({ text: "late result" });
  });

  it("rejects malformed worker output and still terminates the worker", async () => {
    const malformed: TesseractRecognition = { text: "not used" };
    Reflect.deleteProperty(malformed, "text");
    let terminated = 0;
    const worker: TesseractWorker = {
      recognize: async () => malformed,
      terminate: async () => {
        terminated += 1;
      },
    };
    const provider = createTesseractProvider({
      createWorker: async () => worker,
    });

    await expect(
      provider.recognize(image, contextFor().context),
    ).rejects.toMatchObject({
      providerCode: "INVALID_OUTPUT",
    });
    expect(terminated).toBe(1);
  });

  it("enforces byte and pixel limits before creating a worker", async () => {
    let factoryCalls = 0;
    const worker: TesseractWorker = {
      recognize: async () => ({ text: "unused" }),
      terminate: async () => undefined,
    };
    const provider = createTesseractProvider({
      createWorker: async () => {
        factoryCalls += 1;
        return worker;
      },
    });

    await expect(
      provider.recognize(
        image,
        contextFor({ limits: { maxInputBytes: 2 } }).context,
      ),
    ).rejects.toMatchObject({ providerCode: "RESOURCE_LIMIT" });
    expect(factoryCalls).toBe(0);

    await expect(
      provider.recognize(
        { ...image, bytes: new Uint8Array([1]), width: 2, height: 2 },
        contextFor({ limits: { maxImagePixels: 3 } }).context,
      ),
    ).rejects.toMatchObject({ providerCode: "RESOURCE_LIMIT" });
    expect(factoryCalls).toBe(0);
  });
});
