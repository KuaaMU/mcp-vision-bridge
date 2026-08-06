import { describe, expect, it } from "vitest";
import { detectMime, assertSupportedImage, SUPPORTED_MIMES } from "./mime.js";
import { pngFixture, jpegFixture, textFixture } from "../__fixtures__/images.js";

describe("detectMime", () => {
  it("detects PNG", () => {
    expect(detectMime(pngFixture())).toBe("image/png");
  });

  it("detects JPEG", () => {
    expect(detectMime(jpegFixture())).toBe("image/jpeg");
  });

  it("returns undefined for non-images", () => {
    expect(detectMime(textFixture())).toBeUndefined();
  });

  it("returns undefined for tiny buffers", () => {
    expect(detectMime(Buffer.from([0x89]))).toBeUndefined();
  });
});

describe("assertSupportedImage", () => {
  it("returns the detected mime for supported images", () => {
    expect(assertSupportedImage(pngFixture(), "test.png")).toBe("image/png");
  });

  it("throws unsupportedMime for non-images", () => {
    expect(() => assertSupportedImage(textFixture(), "notes.txt")).toThrowError(
      /does not contain a supported image/,
    );
  });
});

it("SUPPORTED_MIMES contains the standard raster formats", () => {
  expect(SUPPORTED_MIMES).toEqual(new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]));
});
