/**
 * OpenAI-compatible vision provider.
 *
 * Covers the OpenAI API and the many gateways that mimic it (OpenRouter,
 * most Chinese aggregators, opencode GO's model endpoints, local OpenAI
 * emulators). Image content is sent as an `image_url` part with
 * `detail: "high"` for maximum fidelity.
 */

import {
  fetchWithTimeout,
  type VisionChatInput,
  type VisionChatOutput,
  type VisionProvider,
} from "./base.js";
import { providerError, providerTimeout, configError } from "../errors.js";

export interface OpenAIOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  /** Injection point for tests. */
  fetchFn?: typeof fetch;
}

export class OpenAIProvider implements VisionProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAIOptions) {}

  async chat(input: VisionChatInput): Promise<VisionChatOutput> {
    if (!this.options.apiKey) {
      throw configError(
        "VISION_OPENAI_API_KEY is not set. Provide your OpenAI-compatible API key via the environment.",
      );
    }

    const baseUrl = this.options.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/chat/completions`;
    const body = {
      model: this.options.model,
      max_tokens: input.maxTokens || this.options.maxTokens,
      messages: [
        { role: "system", content: input.systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${input.mime};base64,${input.imageBytes.toString("base64")}`,
                detail: "high",
              },
            },
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
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        fetchFn: this.options.fetchFn,
      },
      this.options.timeoutMs,
    ).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        throw providerTimeout(
          `OpenAI-compatible request to "${baseUrl}" timed out after ${this.options.timeoutMs}ms.`,
        );
      }
      throw err;
    });

    const data = await parseJson(response);
    const content = extractContent(data);
    return { text: content, model: data.model as string | undefined };
  }
}

async function parseJson(response: Response): Promise<any> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw providerError(
      `OpenAI-compatible API returned HTTP ${response.status} ${response.statusText}. ${detail.slice(0, 400)}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw providerError("OpenAI-compatible API returned invalid JSON.");
  }
}

/** Pull the text out of the first non-empty content item (text or reasoning). */
function extractContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .filter((part: any) => typeof part?.text === "string")
      .map((part: any) => part.text)
      .join("\n");
    if (text.trim()) return text;
  }
  const reasoning = data?.choices?.[0]?.message?.reasoning_content;
  if (typeof reasoning === "string" && reasoning.trim()) return reasoning;
  throw providerError("OpenAI-compatible API returned an empty response.");
}
