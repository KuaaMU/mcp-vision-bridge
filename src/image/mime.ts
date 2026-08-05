/**
 * Byte-level image MIME detection. Images are the only files the server
 * accepts, so detection is deliberately strict: we inspect magic bytes and
 * reject anything that is not a raster image the vision providers accept.
 */

import { unsupportedMime } from "../errors.js";

export const SUPPORTED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/**
 * Detect the MIME type from magic bytes. Returns undefined when the bytes are
 * not a recognized raster image.
 */
export function detectMime(bytes: Uint8Array): string | undefined {
  if (bytes.length < 12) return undefined;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WEBP: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // GIF: 'GIF8' (87a or 89a)
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  return undefined;
}

/** Assert the bytes are a supported image, returning the detected MIME type. */
export function assertSupportedImage(bytes: Uint8Array, source: string): string {
  const mime = detectMime(bytes);
  if (mime === undefined) {
    throw unsupportedMime(
      `"${source}" does not contain a supported image (PNG, JPEG, WEBP, or GIF). ` +
        "Found bytes that do not match any supported raster format.",
    );
  }
  return mime;
}
