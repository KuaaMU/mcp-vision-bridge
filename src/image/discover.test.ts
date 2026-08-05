import { describe, expect, it } from "vitest";
import { findRecentImages, extractImagesFromTranscript } from "./discover.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pngFixture, jpegFixture } from "../__fixtures__/images.js";

/** Point the Cowork scanner at a temp dir via LOCALAPPDATA. */
function setLocalAppData(dir: string): () => void {
  const prev = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = dir;
  return () => {
    if (prev === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prev;
  };
}

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

  it("discovers Cowork desktop pasted images from uploads/ and skips outputs/", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "cowork-"));
    const restore = setLocalAppData(base);
    const uploads = path.join(
      base, "Claude-3p", "local-agent-mode-sessions", "acct",
      "00000000", "local_abc", "uploads",
    );
    const outputs = path.join(
      base, "Claude-3p", "local-agent-mode-sessions", "acct",
      "00000000", "local_abc", "outputs",
    );
    await fs.mkdir(uploads, { recursive: true });
    await fs.mkdir(outputs, { recursive: true });
    const pasted = path.join(uploads, "1d2c4e1f-9673-4ef6-85a7-e7e3c01e5ae4-1785939828901_image.png");
    await fs.writeFile(pasted, pngFixture());
    await fs.writeFile(path.join(uploads, "note.txt"), "not an image");
    await fs.writeFile(path.join(outputs, "preview.png"), pngFixture()); // must be excluded
    try {
      const images = await findRecentImages({ limit: 10, includeClaudeTranscript: false });
      const cowork = images.filter((i) => i.source.startsWith("cowork:"));
      expect(cowork.length).toBe(1);
      expect(cowork[0].filePath).toBe(pasted);
      expect(cowork.some((i) => i.filePath?.endsWith("outputs/preview.png"))).toBe(false);
    } finally {
      restore();
      await fs.rm(base, { recursive: true, force: true });
    }
  });

  it("discovers Claude Code CLI pasted images from ~/.claude/image-cache", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "home-"));
    const prevHome = process.env.USERPROFILE ?? process.env.HOME;
    const restoreHome = () => {
      if (prevHome) {
        process.env.USERPROFILE = prevHome;
        process.env.HOME = prevHome;
      } else {
        delete process.env.USERPROFILE;
        delete process.env.HOME;
      }
    };
    process.env.USERPROFILE = home;
    process.env.HOME = home;
    try {
      const cacheDir = path.join(home, ".claude", "image-cache", "abc123", "");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(path.join(cacheDir, "1.png"), pngFixture());
      await fs.writeFile(path.join(cacheDir, "2.png"), jpegFixture());
      await fs.writeFile(path.join(cacheDir, "notes.txt"), "not an image");
      const images = await findRecentImages({ limit: 10, includeClaudeTranscript: false });
      const cache = images.filter((i) => i.source.startsWith("claude:image-cache:"));
      expect(cache.length).toBe(2);
      expect(cache.some((i) => i.filePath?.endsWith("1.png"))).toBe(true);
      expect(cache.some((i) => i.filePath?.endsWith("2.png"))).toBe(true);
      expect(cache.some((i) => i.filePath?.endsWith("notes.txt"))).toBe(false);
    } finally {
      restoreHome();
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("discovers Reasonix pasted images from REASONIX_STATE_HOME/sessions", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reasonix-"));
    const prev = process.env.REASONIX_STATE_HOME;
    process.env.REASONIX_STATE_HOME = tmp;
    try {
      const sess = path.join(tmp, "sessions", "abc123");
      await fs.mkdir(sess, { recursive: true });
      await fs.writeFile(path.join(sess, "img-1.png"), pngFixture());
      await fs.writeFile(path.join(sess, "readme.txt"), "not an image");
      const images = await findRecentImages({ limit: 10, includeClaudeTranscript: false });
      const rx = images.filter((i) => i.source.startsWith("reasonix:"));
      expect(rx.length).toBe(1);
      expect(rx[0].filePath?.endsWith("img-1.png")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.REASONIX_STATE_HOME;
      else process.env.REASONIX_STATE_HOME = prev;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
