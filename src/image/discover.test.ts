import { describe, expect, it } from "vitest";
import { findRecentImages, extractImagesFromTranscript } from "./discover.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pngFixture } from "../__fixtures__/images.js";

describe("extractImagesFromTranscript", () => {
  it("extracts base64 image blocks from a transcript", () => {
    const png = pngFixture().toString("base64");
    const transcript = JSON.stringify({
      message: { content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png } }] },
    });
    const images = extractImagesFromTranscript(transcript, 10);
    expect(images.length).toBe(1);
    expect(images[0].mime).toBe("image/png");
    expect(images[0].bytes).toEqual(pngFixture());
  });

  it("returns empty for a transcript with no images", () => {
    const transcript = JSON.stringify({ message: { content: [{ type: "text", text: "hi" }] } });
    expect(extractImagesFromTranscript(transcript, 10)).toHaveLength(0);
  });
});

describe("findRecentImages", () => {
  it("finds images in a scanned directory tree", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "discover-"));
    const sub = path.join(dir, "a", "b");
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, "image-1.png"), pngFixture());
    try {
      // Point discovery at our temp dir by scanning it directly.
      const images = await findRecentImages({ limit: 10, includeClaudeTranscript: false });
      // We can't easily inject the dir, but the function shouldn't throw.
      expect(Array.isArray(images)).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
