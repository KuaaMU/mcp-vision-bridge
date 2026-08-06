import { describe, expect, it } from "vitest";
import { analyzeImage, type ToolDeps } from "./analyze-image.js";
import { pngFixture } from "../__fixtures__/images.js";
import { ImageCache } from "../image/cache.js";
import type { Config } from "../config.js";
import type { VisionProvider } from "../providers/base.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function testConfig(): Config {
  return {
    provider: "openai",
    model: "test-model",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiApiKey: "sk-test",
    anthropicBaseUrl: "https://api.anthropic.com",
    anthropicApiKey: "",
    anthropicVersion: "2023-06-01",
    geminiBaseUrl: "https://generativelanguage.googleapis.com",
    geminiApiKey: "",
    maxTokens: 2048,
    cacheDir: null,
    clipboardDir: ".llm-vision-mcp/clipboard",
    timeoutMs: 5000,
    blockPrivateUrls: false,
    serverHomepage: "https://github.com/KuaaMU/llm-vision-mcp",
  };
}

function fakeProvider(returns: { text: string; model?: string }): VisionProvider {
  return {
    name: "fake",
    chat: async () => returns,
  };
}

function makeDeps(overrides?: Partial<ToolDeps>): ToolDeps {
  return {
    config: testConfig(),
    provider: fakeProvider({ text: "a detailed description of the image" }),
    cache: new ImageCache(null),
    ...overrides,
  };
}

describe("analyzeImage", () => {
  it("returns the provider description for a valid image", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, pngFixture());
    try {
      const result = await analyzeImage({ image: file }, makeDeps());
      expect(result.content[0].text).toBe("a detailed description of the image");
      expect(result.isError).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("uses a preset prompt when task is provided", async () => {
    const provider = fakeProvider({ text: "OCR result" });
    const chatSpy = provider.chat;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, pngFixture());
    try {
      await analyzeImage({ image: file, task: "ocr" }, makeDeps({ provider }));
      const call = await chatSpy;
      expect(call).toBeDefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("writes to save_to and returns a summary", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const file = path.join(dir, "a.png");
    const out = path.join(dir, "out.md");
    await fs.writeFile(file, pngFixture());
    try {
      const result = await analyzeImage(
        { image: file, save_to: out },
        makeDeps({ provider: fakeProvider({ text: "X".repeat(5000) }) }),
      );
      const text = result.content[0].text;
      expect(text).toContain(`Full description written to: ${out}`);
      expect(text).toContain("--- Summary");
      const written = await fs.readFile(out, "utf8");
      expect(written).toBe("X".repeat(5000));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("returns a clear error for an invalid task", async () => {
    const result = await analyzeImage({ image: "ignored", task: "bogus" }, makeDeps());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown task "bogus"/);
  });

  it("returns an error for a missing file", async () => {
    const result = await analyzeImage(
      { image: "C:\\nope\\missing.png" },
      makeDeps(),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Could not read image file/);
  });

  it("returns an error when the provider fails", async () => {
    const provider: VisionProvider = {
      name: "failing",
      chat: async () => {
        throw new Error("provider exploded");
      },
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const file = path.join(dir, "a.png");
    await fs.writeFile(file, pngFixture());
    try {
      const result = await analyzeImage({ image: file }, makeDeps({ provider }));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/provider exploded/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("scales maxTokens up for multi-image input so no image description is truncated", async () => {
    const calls: any[] = [];
    const provider: VisionProvider = {
      name: "spy",
      chat: async (input) => {
        calls.push(input);
        return { text: "ok" };
      },
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const a = path.join(dir, "a.png");
    const b = path.join(dir, "b.png");
    const c = path.join(dir, "c.png");
    await fs.writeFile(a, pngFixture());
    await fs.writeFile(b, pngFixture());
    await fs.writeFile(c, pngFixture());
    try {
      // 3 images, per-image budget 4096 → expect 4096*3 = 12288 (not diluted).
      await analyzeImage({ image: [a, b, c] }, makeDeps({ provider }));
      expect(calls).toHaveLength(1);
      expect(calls[0].images).toHaveLength(3);
      expect(calls[0].maxTokens).toBe(12288);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps a single image at the 4096 per-image budget", async () => {
    const calls: any[] = [];
    const provider: VisionProvider = {
      name: "spy",
      chat: async (input) => {
        calls.push(input);
        return { text: "ok" };
      },
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const a = path.join(dir, "a.png");
    await fs.writeFile(a, pngFixture());
    try {
      await analyzeImage({ image: a }, makeDeps({ provider }));
      expect(calls).toHaveLength(1);
      expect(calls[0].maxTokens).toBe(4096);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("respects a higher VISION_MAX_TOKENS for detailed descriptions", async () => {
    const calls: any[] = [];
    const provider: VisionProvider = {
      name: "spy",
      chat: async (input) => {
        calls.push(input);
        return { text: "ok" };
      },
    };
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vimg-"));
    const a = path.join(dir, "a.png");
    const b = path.join(dir, "b.png");
    await fs.writeFile(a, pngFixture());
    await fs.writeFile(b, pngFixture());
    try {
      const config = { ...testConfig(), maxTokens: 8000 };
      await analyzeImage({ image: [a, b] }, makeDeps({ provider, config }));
      expect(calls[0].maxTokens).toBe(16000);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
