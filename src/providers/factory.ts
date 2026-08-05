/**
 * Provider factory: build the adapter the config requests.
 */

import type { Config } from "../config.js";
import { configError } from "../errors.js";
import type { VisionProvider } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";

export function createProvider(config: Config): VisionProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider({
        baseUrl: config.openaiBaseUrl,
        apiKey: config.openaiApiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      });
    case "anthropic":
      return new AnthropicProvider({
        baseUrl: config.anthropicBaseUrl,
        apiKey: config.anthropicApiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
        version: config.anthropicVersion,
      });
    case "gemini":
      return new GeminiProvider({
        baseUrl: config.geminiBaseUrl,
        apiKey: config.geminiApiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      });
    default:
      throw configError(`No provider implementation for "${config.provider}".`);
  }
}
