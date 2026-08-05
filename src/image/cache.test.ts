import { describe, expect, it } from "vitest";
import { ImageCache } from "./cache.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pngFixture } from "../__fixtures__/images.js";

describe("ImageCache", () => {
  it("stores and retrieves from memory", async () => {
    const cache = new ImageCache(null);
    const bytes = pngFixture();
    await cache.set("url:https://example.com/a.png", bytes);
    expect(await cache.get("url:https://example.com/a.png")).toEqual(bytes);
  });

  it("returns null on a memory miss", async () => {
    const cache = new ImageCache(null);
    expect(await cache.get("path:nope.png")).toBeNull();
  });

  it("evicts least-recently-used entries", async () => {
    const cache = new ImageCache(null, 2);
    await cache.set("a", pngFixture());
    await cache.set("b", pngFixture());
    await cache.set("c", pngFixture());
    expect(await cache.get("a")).toBeNull();
    expect(await cache.get("b")).not.toBeNull();
    expect(await cache.get("c")).not.toBeNull();
  });

  it("persists to disk when cacheDir is set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "imgcache-"));
    try {
      const cache = new ImageCache(dir);
      const bytes = pngFixture();
      await cache.set("url:https://example.com/b.png", bytes);
      const fresh = new ImageCache(dir);
      expect(await fresh.get("url:https://example.com/b.png")).toEqual(bytes);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keyFor is deterministic and filename-safe", () => {
    expect(ImageCache.keyFor("a")).toBe(ImageCache.keyFor("a"));
    expect(ImageCache.keyFor("a")).toMatch(/^[0-9a-f]{40}$/);
  });
});
