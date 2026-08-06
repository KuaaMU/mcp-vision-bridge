/**
 * Anthropic vision provider (Messages API).
 *
 * The image is sent as a base64 `image` block. Handles the `text` response
 * block and surfaces the `stop_reason` when the model ran out of tokens.
 */

import {
  fetchWithTimeout,
  type VisionChatInput,
  type VisionChatOutput,
  type VisionProvider,
} from "./base.js";
import { providerError, providerTimeout, configError } from "../errors.js";

export interface AnthropicOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  version?: string;
  fetchFn?: typeof fetch;
}

export class AnthropicProvider implements VisionProvider {
  readonly name = "anthropic";

  constructor(private readonly options: AnthropicOptions) {}

  async chat(input: VisionChatInput): Promise<VisionChatOutput> {
    if (!this.options.apiKey) {
      throw configError(
        "VISION_ANTHROPIC_API_KEY is not set. Provide your Anthropic API key via the environment.",
      );
    }

    const baseUrl = this.options.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/v1/messages`;
    const body = {
      model: this.options.model,
      max_tokens: input.maxTokens || this.options.maxTokens,
      system: input.systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            ...input.images.map((img) => ({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mime,
                data: img.bytes.toString("base64"),
              },
            })),
            { type: "text", text: input.userPrompt },
          ],
        },
      ],
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.options.apiKey,
          "anthropic-version": this.options.version ?? "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
        fetchFn: this.options.fetchFn,
      },
      this.options.timeoutMs,
    ).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        throw providerTimeout(
          `Anthropic request to "${baseUrl}" timed out after ${this.options.timeoutMs}ms.`,
        );
      }
      throw err;
    });

    const data = await parseJson(response);
    const parts = Array.isArray(data?.content)
      ? (data.content as Array<{ type: string; text?: string }>)
      : [];
    const text = parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (data?.stop_reason === "max_tokens") {
      throw providerError(
        `Anthropic response was truncated because it hit the ${input.maxTokens || this.options.maxTokens} token limit. ` +
          "Raise VISION_MAX_TOKENS if you need longer descriptions.",
      );
    }

    if (!text) {
      throw providerError("Anthropic returned an empty text response.");
    }

    return { text, model: data?.model as string | undefined };
  }
}

async function parseJson(response: Response): Promise<any> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw providerError(
      `Anthropic API returned HTTP ${response.status} ${response.statusText}. ${detail.slice(0, 400)}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw providerError("Anthropic API returned invalid JSON.");
  }
}
