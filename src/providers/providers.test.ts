import { describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { createProvider } from "./factory.js";
import { pngFixture } from "../__fixtures__/images.js";
import type { Config } from "../config.js";

function mockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    provider: "openai",
    model: "mimo-v2.5",
    openaiBaseUrl: "https://api.openai.com/v1",
    openaiApiKey: "sk-test",
    anthropicBaseUrl: "https://api.anthropic.com",
    anthropicApiKey: "sk-ant-test",
    anthropicVersion: "2023-06-01",
    geminiBaseUrl: "https://generativelanguage.googleapis.com",
    geminiApiKey: "ai-test",
    maxTokens: 2048,
    cacheDir: null,
    clipboardDir: ".llm-vision-mcp/clipboard",
    timeoutMs: 5000,
    blockPrivateUrls: false,
    serverHomepage: "https://github.com/KuaaMU/llm-vision-mcp",
    ...overrides,
  };
}

const input = {
  images: [{ bytes: pngFixture(), mime: "image/png" }],
  userPrompt: "What is in this image?",
  systemPrompt: "You are a vision assistant.",
  maxTokens: 512,
};

describe("multi-image support", () => {
  it("sends multiple image parts in one OpenAI request", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse({ choices: [{ message: { content: "two images" } }] }),
    ) as unknown as typeof fetch;
    const provider = new OpenAIProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "m",
      maxTokens: 2048,
      timeoutMs: 5000,
      fetchFn,
    });
    await provider.chat({
      images: [
        { bytes: pngFixture(), mime: "image/png" },
        { bytes: pngFixture(), mime: "image/png" },
      ],
      userPrompt: "compare",
      systemPrompt: "s",
      maxTokens: 512,
    });
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    void url;
    const body = JSON.parse(String(init.body));
    expect(body.messages[1].content.filter((p: any) => p.type === "image_url")).toHaveLength(2);
  });

  it("sends multiple inline_data parts in one Gemini request", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    ) as unknown as typeof fetch;
    const provider = new GeminiProvider({
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "ai-test",
      model: "gemini-2.0-flash",
      maxTokens: 2048,
      timeoutMs: 5000,
      fetchFn,
    });
    await provider.chat({
      images: [
        { bytes: pngFixture(), mime: "image/png" },
        { bytes: pngFixture(), mime: "image/png" },
        { bytes: pngFixture(), mime: "image/png" },
      ],
      userPrompt: "compare",
      systemPrompt: "s",
      maxTokens: 512,
    });
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    void url;
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts.filter((p: any) => p.inline_data)).toHaveLength(3);
  });
});

describe("OpenAIProvider", () => {
  it("sends a chat completion with the image and returns text", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse({ choices: [{ message: { content: "a red circle" } }], model: "mimo-v2.5" }),
    ) as unknown as typeof fetch;
    const provider = new OpenAIProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "mimo-v2.5",
      maxTokens: 2048,
      timeoutMs: 5000,
      fetchFn,
    });
    const out = await provider.chat(input);
    expect(out.text).toBe("a red circle");
    expect(out.model).toBe("mimo-v2.5");
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content[0].type).toBe("image_url");
    expect(body.messages[1].content[0].image_url.detail).toBe("high");
  });

  it("throws a clear error when the API key is missing", async () => {
    const provider = new OpenAIProvider({
      baseUrl: "https://x",
      apiKey: "",
      model: "m",
      maxTokens: 100,
      timeoutMs: 1000,
    });
    await expect(provider.chat(input)).rejects.toThrow(/VISION_OPENAI_API_KEY/);
  });

  it("surfaces non-OK status as providerError", async () => {
    const fetchFn = (async () =>
      new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    const provider = new OpenAIProvider({
      baseUrl: "https://x",
      apiKey: "k",
      model: "m",
      maxTokens: 100,
      timeoutMs: 1000,
      fetchFn,
    });
    await expect(provider.chat(input)).rejects.toThrow(/HTTP 401/);
  });
});

describe("AnthropicProvider", () => {
  it("sends a messages request with an image block", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse({ content: [{ type: "text", text: "a blue square" }], model: "claude-x" }),
    ) as unknown as typeof fetch;
    const provider = new AnthropicProvider({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      model: "claude-x",
      maxTokens: 2048,
      timeoutMs: 5000,
      fetchFn,
    });
    const out = await provider.chat(input);
    expect(out.text).toBe("a blue square");
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content[0].type).toBe("image");
    expect(body.messages[0].content[0].source.media_type).toBe("image/png");
  });

  it("throws when max_tokens truncates", async () => {
    const fetchFn = (async () =>
      mockResponse({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" })) as unknown as typeof fetch;
    const provider = new AnthropicProvider({
      baseUrl: "https://api.anthropic.com",
      apiKey: "k",
      model: "m",
      maxTokens: 100,
      timeoutMs: 1000,
      fetchFn,
    });
    await expect(provider.chat(input)).rejects.toThrow(/truncated/);
  });
});

describe("GeminiProvider", () => {
  it("sends inline_data and returns text", async () => {
    const fetchFn = vi.fn(async () =>
      mockResponse({
        candidates: [{ content: { parts: [{ text: "a green triangle" }] } }],
        modelVersion: "gemini-2.0-flash",
      }),
    ) as unknown as typeof fetch;
    const provider = new GeminiProvider({
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "ai-test",
      model: "gemini-2.0-flash",
      maxTokens: 2048,
      timeoutMs: 5000,
      fetchFn,
    });
    const out = await provider.chat(input);
    expect(out.text).toBe("a green triangle");
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("gemini-2.0-flash:generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe("image/png");
    expect(body.contents[0].parts[0].inline_data.data).toBeTruthy();
  });

  it("surfaces block reasons", async () => {
    const fetchFn = (async () =>
      mockResponse({ promptFeedback: { blockReason: "SAFETY" } })) as unknown as typeof fetch;
    const provider = new GeminiProvider({
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "k",
      model: "m",
      maxTokens: 100,
      timeoutMs: 1000,
      fetchFn,
    });
    await expect(provider.chat(input)).rejects.toThrow(/blocked/);
  });
});

describe("createProvider", () => {
  it("builds the provider from config", () => {
    expect(createProvider(baseConfig()).name).toBe("openai");
    expect(createProvider(baseConfig({ provider: "anthropic" })).name).toBe("anthropic");
    expect(createProvider(baseConfig({ provider: "gemini" })).name).toBe("gemini");
  });
});
