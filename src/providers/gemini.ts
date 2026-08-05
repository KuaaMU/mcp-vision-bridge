/**
 * Google Gemini vision provider (generativelanguage REST API, v1beta).
 *
 * The image is sent as an `inline_data` part in a `contents` message.
 */

import {
  fetchWithTimeout,
  type VisionChatInput,
  type VisionChatOutput,
  type VisionProvider,
} from "./base.js";
import { providerError, providerTimeout, configError } from "../errors.js";

export interface GeminiOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}

export class GeminiProvider implements VisionProvider {
  readonly name = "gemini";

  constructor(private readonly options: GeminiOptions) {}

  async chat(input: VisionChatInput): Promise<VisionChatOutput> {
    if (!this.options.apiKey) {
      throw configError(
        "VISION_GEMINI_API_KEY is not set. Provide your Google API key via the environment.",
      );
    }

    const baseUrl = this.options.baseUrl.replace(/\/+$/, "");
    const url =
      `${baseUrl}/v1beta/models/${this.options.model}:generateContent?key=${encodeURIComponent(this.options.apiKey)}`;
    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: input.mime, data: input.imageBytes.toString("base64") } },
            { text: input.userPrompt },
          ],
        },
      ],
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      generationConfig: { maxOutputTokens: input.maxTokens || this.options.maxTokens },
    };

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fetchFn: this.options.fetchFn,
      },
      this.options.timeoutMs,
    ).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") {
        throw providerTimeout(
          `Gemini request to "${baseUrl}" timed out after ${this.options.timeoutMs}ms.`,
        );
      }
      throw err;
    });

    const data = await parseJson(response);
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter((part: any) => typeof part?.text === "string")
      .map((part: any) => part.text)
      .join("\n")
      .trim();

    if (!text) {
      const block = data?.promptFeedback?.blockReason;
      throw providerError(
        block
          ? `Gemini blocked this request (${block}).`
          : "Gemini returned an empty response.",
      );
    }

    return { text, model: data?.modelVersion as string | undefined };
  }
}

async function parseJson(response: Response): Promise<any> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw providerError(
      `Gemini API returned HTTP ${response.status} ${response.statusText}. ${detail.slice(0, 400)}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw providerError("Gemini API returned invalid JSON.");
  }
}
