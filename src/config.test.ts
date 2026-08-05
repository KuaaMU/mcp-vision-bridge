import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const VARS = {
  VISION_PROVIDER: undefined as string | undefined,
  VISION_MODEL: undefined as string | undefined,
  VISION_OPENAI_BASE_URL: undefined as string | undefined,
  VISION_ANTHROPIC_BASE_URL: undefined as string | undefined,
  VISION_GEMINI_BASE_URL: undefined as string | undefined,
  VISION_MAX_TOKENS: undefined as string | undefined,
  VISION_TIMEOUT_MS: undefined as string | undefined,
  VISION_CACHE_DIR: undefined as string | undefined,
  VISION_BLOCK_PRIVATE_URLS: undefined as string | undefined,
};

describe("loadConfig", () => {
  it("defaults to the openai provider and mimo model", () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("openai");
    expect(cfg.model).toBe("mimo-v2.5");
  });

  it("honors VISION_PROVIDER", () => {
    expect(loadConfig({ VISION_PROVIDER: "anthropic" }).provider).toBe("anthropic");
    expect(loadConfig({ VISION_PROVIDER: "gemini" }).provider).toBe("gemini");
  });

  it("rejects an unsupported provider with a clear error", () => {
    expect(() => loadConfig({ VISION_PROVIDER: "claude" })).toThrowError(
      /VISION_PROVIDER must be one of/,
    );
  });

  it("reads numeric options with fallbacks", () => {
    const cfg = loadConfig({ VISION_MAX_TOKENS: "5000" } as NodeJS.ProcessEnv);
    expect(cfg.maxTokens).toBe(5000);
    expect(cfg.timeoutMs).toBe(60_000);
  });

  it("defaults base URLs per provider", () => {
    const cfg = loadConfig({ VISION_PROVIDER: "gemini" });
    expect(cfg.geminiBaseUrl).toContain("generativelanguage");
    expect(cfg.anthropicBaseUrl).toContain("anthropic");
    expect(cfg.openaiBaseUrl).toContain("openai");
  });
});
