import { describe, expect, it } from "vitest";
import { DEFAULT_RESOURCE_LIMITS } from "@ndycode/timetablekit";
import { exceedsImagePixelLimit, readImageDimensions } from "./input-boundary";

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

describe("image input boundary", () => {
  it("reads image dimensions before browser decoding", () => {
    const dimensions = readImageDimensions(pngBytes(5001, 5000), "image/png");

    expect(dimensions).toEqual({ width: 5001, height: 5000 });
    expect(
      dimensions === undefined
        ? false
        : exceedsImagePixelLimit(
            dimensions,
            DEFAULT_RESOURCE_LIMITS.maxImagePixels,
          ),
    ).toBe(true);
  });

  it("supports JPEG dimensions and ignores unknown formats", () => {
    const jpeg = new Uint8Array(21);
    jpeg.set([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x03, 0x20,
    ]);

    expect(readImageDimensions(jpeg, "image/jpeg")).toEqual({
      width: 800,
      height: 640,
    });
    expect(readImageDimensions(new Uint8Array([1, 2, 3]), "image/png")).toBe(
      undefined,
    );
  });
});
