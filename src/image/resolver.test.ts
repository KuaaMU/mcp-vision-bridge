import { describe, expect, it, vi } from "vitest";
import { resolveImage, classifySource, type ResolveOptions } from "./resolver.js";
import { ImageCache } from "./cache.js";
import { pngFixture, jpegFixture, textFixture } from "../__fixtures__/images.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function makeOpts(overrides?: Partial<ResolveOptions>): ResolveOptions {
  return {
    timeoutMs: 5000,
    blockPrivateUrls: false,
    cache: new ImageCache(null),
    clipboardConfig: { clipboardDir: path.join(os.tmpdir(), "llm-vision-clip") },
    ...overrides,
  };
}

describe("classifySource", () => {
  it("classifies a local path", () => {
    expect(classifySource("C:\\tmp\\x.png").kind).toBe("path");
    expect(classifySource("./img.png").kind).toBe("path");
    expect(classifySource("img.png").kind).toBe("path");
  });

  it("classifies URLs and data URIs", () => {
    expect(classifySource("https://x.com/a.png").kind).toBe("url");
    expect(classifySource("data:image/png;base64,AAAA").kind).toBe("data");
  });

  it("classifies clipboard and raw", () => {
    expect(classifySource("clipboard").kind).toBe("clipboard");
    expect(classifySource("raw").kind).toBe("raw");
  });
});

describe("resolveImage", () => {
  it("resolves a local file path", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, pngFixture());
    try {
      const resolved = await resolveImage(file, makeOpts());
      expect(resolved.mime).toBe("image/png");
      expect(resolved.bytes.equals(pngFixture())).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("throws a clear error for a missing file", async () => {
    await expect(
      resolveImage("C:\\definitely\\missing\\x.png", makeOpts()),
    ).rejects.toThrow(/Could not read image file/);
  });

  it("resolves a URL through the injected fetch", async () => {
    const fetchFn = (async () =>
      new Response(pngFixture(), {
        status: 200,
        headers: { "content-type": "image/png" },
      })) as unknown as typeof fetch;
    const resolved = await resolveImage(
      "https://example.com/a.png",
      makeOpts({ fetchFn }),
    );
    expect(resolved.mime).toBe("image/png");
  });

  it("propagates non-OK HTTP as imageFetchFailed", async () => {
    const fetchFn = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(
      resolveImage("https://example.com/missing.png", makeOpts({ fetchFn })),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("resolves a base64 data URI", async () => {
    const uri = `data:image/png;base64,${pngFixture().toString("base64")}`;
    const resolved = await resolveImage(uri, makeOpts());
    expect(resolved.mime).toBe("image/png");
    expect(resolved.bytes.equals(pngFixture())).toBe(true);
  });

  it("resolves raw bytes passed as a binary string", async () => {
    const resolved = await resolveImage(pngFixture().toString("binary"), makeOpts());
    expect(resolved.mime).toBe("image/png");
  });

  it("rejects non-image bytes with unsupportedMime", async () => {
    await expect(resolveImage("raw", makeOpts())).rejects.toThrow(
      /does not contain a supported image/,
    );
  });

  it("rejects data URI whose declared mime mismatches the bytes", async () => {
    const uri = `data:image/jpeg;base64,${pngFixture().toString("base64")}`;
    await expect(resolveImage(uri, makeOpts())).rejects.toThrow(/declares "image\/jpeg"/);
  });

  it("caches by source so a second resolution hits the cache", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(pngFixture(), { status: 200 }),
    ) as unknown as typeof fetch;
    const opts = makeOpts({ fetchFn });
    const a = await resolveImage("https://example.com/c.png", opts);
    const b = await resolveImage("https://example.com/c.png", opts);
    expect(a.mime).toBe("image/png");
    expect(b.mime).toBe("image/png");
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("SSRF guard blocks a private URL when enabled", async () => {
    await expect(
      resolveImage("http://127.0.0.1:9999/a.png", makeOpts({ blockPrivateUrls: true })),
    ).rejects.toThrow(/blocked by SSRF guard/);
  });

  it("allows a private URL when the guard is off", async () => {
    const fetchFn = (async () =>
      new Response(pngFixture(), { status: 200 })) as unknown as typeof fetch;
    const resolved = await resolveImage(
      "http://127.0.0.1:9999/a.png",
      makeOpts({ blockPrivateUrls: false, fetchFn }),
    );
    expect(resolved.mime).toBe("image/png");
  });
});
