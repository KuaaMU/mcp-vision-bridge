/**
 * Vision provider abstraction.
 *
 * Every adapter implements the same `chat` contract: raw image bytes, MIME
 * type, user prompt, system prompt → plain text response. The provider layer
 * is intentionally narrow — the caller (tool handler) never needs to know
 * which upstream is behind the interface.
 */

export interface VisionChatInput {
  imageBytes: Buffer;
  mime: string;
  userPrompt: string;
  systemPrompt: string;
  maxTokens: number;
}

export interface VisionChatOutput {
  text: string;
  /** Raw upstream model id that produced the response, when known. */
  model?: string;
}

export interface VisionProvider {
  readonly name: string;
  chat(input: VisionChatInput): Promise<VisionChatOutput>;
}

/** RequestInit plus an optional injected fetch (used to mock in tests). */
export type VisionRequestInit = RequestInit & { fetchFn?: typeof fetch };

/** Shared fetch with timeout + JSON error normalization. Honors an injected fetch. */
export async function fetchWithTimeout(
  url: string,
  init: VisionRequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const doFetch = init.fetchFn ?? fetch;
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}
