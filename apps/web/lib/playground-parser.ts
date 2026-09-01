import {
  ProviderError,
  createTimetableParser,
  parseTimetable,
} from "@ndycode/timetablekit";
import type {
  ExtractionArtifact,
  ExtractionProvider,
  OcrProvider,
  ParseOptions,
  SourceDescriptor,
  TimetableInput,
  TimetableParseResult,
} from "@ndycode/timetablekit";
import { exceedsImagePixelLimit, readImageDimensions } from "./input-boundary";

export const LOCAL_OCR_ASSETS = {
  workerPath: "/tesseract/worker.min.js",
  corePath: "/tesseract/core",
  langPath: "/tesseract/lang/4.0.0_best_int",
} as const;

function imageExtractionProvider(ocrProvider: OcrProvider): ExtractionProvider {
  return {
    id: "tesseract-image",
    supports(input): boolean {
      return input.kind === "image";
    },
    async extract(input, context): Promise<ExtractionArtifact> {
      if (input.kind !== "image") throw new Error("This image cannot be read.");
      const dimensions = readImageDimensions(input.bytes, input.mimeType);
      if (
        dimensions !== undefined &&
        exceedsImagePixelLimit(dimensions, context.limits.maxImagePixels)
      ) {
        throw new ProviderError(
          "tesseract-image",
          "RESOURCE_LIMIT",
          "That image is too large.",
        );
      }
      const blob = new Blob([new Uint8Array(input.bytes)], {
        type: input.mimeType,
      });
      const bitmap = await createImageBitmap(blob);
      try {
        if (
          exceedsImagePixelLimit(
            { width: bitmap.width, height: bitmap.height },
            context.limits.maxImagePixels,
          )
        ) {
          throw new ProviderError(
            "tesseract-image",
            "RESOURCE_LIMIT",
            "That image is too large.",
          );
        }
        const recognized = await ocrProvider.recognize(
          {
            bytes: input.bytes,
            mimeType: input.mimeType,
            width: bitmap.width,
            height: bitmap.height,
          },
          context,
        );
        const source: SourceDescriptor = {
          kind: "image",
          mimeType: input.mimeType,
          ...(input.filename === undefined ? {} : { filename: input.filename }),
        };
        return {
          providerId: ocrProvider.id,
          document: { source, pages: [recognized.page] },
          warnings: recognized.warningCodes.map((code) => ({
            code,
            severity: "warning" as const,
            message: "The image reader found a problem.",
          })),
        };
      } finally {
        bitmap.close();
      }
    },
  };
}

export async function parsePlaygroundInput(
  input: TimetableInput,
  options: ParseOptions,
): Promise<TimetableParseResult> {
  if (input.kind === "text" || input.kind === "csv") {
    return parseTimetable(input, options);
  }
  const [{ createTesseractProvider }, { createPdfJsProvider }] =
    await Promise.all([
      import("@ndycode/timetablekit-provider-tesseract"),
      import("@ndycode/timetablekit-provider-pdfjs"),
    ]);
  const ocr = createTesseractProvider(LOCAL_OCR_ASSETS);
  const parser = createTimetableParser({
    providers: [
      imageExtractionProvider(ocr),
      createPdfJsProvider({ ocrProvider: ocr }),
    ],
  });
  return parser.parse(input, options);
}
