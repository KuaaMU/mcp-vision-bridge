/**
 * Minimal 1x1 PNG / JPEG byte fixtures used across tests.
 * Generated deterministically — no external image libs needed.
 */

import { createHash } from "node:crypto";

/** A valid 1x1 red PNG. */
export function pngFixture(): Buffer {
  // Base64 of a 1x1 transparent PNG.
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

/** A minimal valid JPEG (1x1). */
export function jpegFixture(): Buffer {
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
    "base64",
  );
}

/** A non-image buffer (text). */
export function textFixture(): Buffer {
  return Buffer.from("this is not an image", "utf8");
}

/** A fake PNG for tests that only need a cacheable blob. */
export function arbitraryPngBytes(): Buffer {
  const base = pngFixture();
  const seed = createHash("sha1").update("arbitrary").digest("hex");
  return Buffer.concat([base, Buffer.from(seed, "utf8")]);
}
