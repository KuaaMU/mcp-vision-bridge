/**
 * Unit tests for the vision-capture detector logic (hooks/vision-capture.mjs).
 *
 * The detector's job is to answer ONE question: "did the user paste images in
 * THIS message?" — not "does this session contain any images from the past?"
 *
 * Regression test for the false-positive bug: the old fallback scanned the
 * ENTIRE session transcript and counted every historical image block, so a
 * plain-text message in a session that had previously received images would be
 * reported as "user pasted N images". That must never happen.
 */

import { describe, it, expect } from "vitest";
import { countPromptMarkers, detectCurrentImages } from "../hooks/vision-capture.mjs";

describe("countPromptMarkers — [Image #N] placeholder detection", () => {
  it("counts real pasted-image placeholders", () => {
    expect(countPromptMarkers("look at this [Image #1] [Image #2]")).toBe(2);
  });

  it("returns 0 for plain text without placeholders", () => {
    expect(countPromptMarkers("help me refactor this function")).toBe(0);
  });

  it("returns 1 for the stripped-image placeholder (text-only gateway)", () => {
    expect(countPromptMarkers("what is this [Unsupported Image]?")).toBe(1);
  });
});

describe("detectCurrentImages — no cross-message contamination", () => {
  it("returns 0 for a plain-text message even when a transcript with historical images exists", () => {
    // This is the core regression: the old fallback counted ALL image blocks
    // in the transcript (3 historical images → reported "3 images").
    const transcriptWithHistory = [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/webp", data: "CCCC" } },
          ],
        },
      }),
    ].join("\n");

    const result = detectCurrentImages({
      prompt: "帮我优化一下这段代码",
      transcriptText: transcriptWithHistory,
    });
    expect(result).toBe(0);
  });

  it("counts [Image #N] markers in the current prompt as the source of truth", () => {
    const result = detectCurrentImages({
      prompt: "看这个 [Image #1] [Image #2]",
      transcriptText: JSON.stringify({ type: "user", message: { content: [] } }),
    });
    expect(result).toBe(2);
  });

  it("returns 0 for empty/absent prompt", () => {
    expect(detectCurrentImages({})).toBe(0);
    expect(detectCurrentImages({ prompt: "" })).toBe(0);
  });
});
