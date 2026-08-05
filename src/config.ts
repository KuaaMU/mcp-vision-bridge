/**
 * Runtime configuration, sourced entirely from environment variables.
 *
 * Provider API keys are read ONLY from the environment — never from tool
 * arguments — so a prompt-injected agent cannot read or exfiltrate them.
 */

export type ProviderName = "openai" | "anthropic" | "gemini";

export interface Config {
  provider: ProviderName;
  /** Model id passed to the provider, e.g. "mimo-v2.5", "claude-sonnet-4-5", "gemini-2.0-flash". */
  model: string;
  /** OpenAI-compatible base URL. May point at OpenRouter, a Chinese gateway, or opencode GO's endpoint. */
  openaiBaseUrl: string;
  openaiApiKey: string;
  anthropicBaseUrl: string;
  anthropicApiKey: string;
  /** Anthropic version header value. */
  anthropicVersion: string;
  geminiBaseUrl: string;
  geminiApiKey: string;
  /** Cap on the vision model's text output (tokens). */
  maxTokens: number;
  /** Optional sidecar cache directory for fetched/decoded images. */
  cacheDir: string | null;
  /** Directory used by clipboard images on macOS when bytes must round-trip through a file. */
  clipboardDir: string;
  /** Fetch timeout for remote images and provider calls, in milliseconds. */
  timeoutMs: number;
  /** Block URL-based fetches to private/localhost ranges to avoid SSRF. */
  blockPrivateUrls: boolean;
  /** URL to a plain-text README used by the server "resources" for visibility. */
  serverHomepage: string;
}

const SUPPORTED_PROVIDERS: ProviderName[] = ["openai", "anthropic", "gemini"];

function providerFromEnv(envVars: NodeJS.ProcessEnv): ProviderName {
  const name = (envVars.VISION_PROVIDER ?? "openai").toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(name as ProviderName)) {
    throw new Error(
      `VISION_PROVIDER must be one of: ${SUPPORTED_PROVIDERS.join(", ")}. Got "${name}".`,
    );
  }
  return name as ProviderName;
}

export function loadConfig(envVars: NodeJS.ProcessEnv = process.env): Config {
  const provider = providerFromEnv(envVars);

  const config: Config = {
    provider,
    model: envVars.VISION_MODEL ?? defaultModelFor(provider),
    openaiBaseUrl: envVars.VISION_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiApiKey: envVars.VISION_OPENAI_API_KEY ?? "",
    anthropicBaseUrl: envVars.VISION_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    anthropicApiKey: envVars.VISION_ANTHROPIC_API_KEY ?? "",
    anthropicVersion: envVars.VISION_ANTHROPIC_VERSION ?? "2023-06-01",
    geminiBaseUrl: envVars.VISION_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com",
    geminiApiKey: envVars.VISION_GEMINI_API_KEY ?? "",
    maxTokens: intEnv(envVars.VISION_MAX_TOKENS, 2048),
    cacheDir: envVars.VISION_CACHE_DIR ?? null,
    clipboardDir: envVars.VISION_CLIPBOARD_DIR ?? defaultClipboardDir(),
    timeoutMs: intEnv(envVars.VISION_TIMEOUT_MS, 60_000),
    blockPrivateUrls: envVars.VISION_BLOCK_PRIVATE_URLS === "true",
    serverHomepage: "https://github.com/KuaaMU/llm-vision-mcp",
  };

  return config;
}

function defaultModelFor(provider: ProviderName): string {
  switch (provider) {
    case "openai":
      return "mimo-v2.5";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "gemini":
      return "gemini-2.0-flash";
  }
}

function intEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultClipboardDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (home) return `${home}/.llm-vision-mcp/clipboard`;
  return ".llm-vision-mcp/clipboard";
}
