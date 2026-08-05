/**
 * Real-endpoint smoke: point llm-vision-mcp at the live opencode GO gateway
 * and analyze a local image with mimo-v2.5.
 *
 * Requires VISION_LIVE_KEY (or VISION_OPENAI_API_KEY) + VISION_LIVE_BASE_URL.
 * Does NOT commit any secret.
 */
import { loadConfig } from "../dist/config.js";
import { createProvider } from "../dist/providers/factory.js";
import { resolveImage } from "../dist/image/resolver.js";
import { ImageCache } from "../dist/image/cache.js";
import { defaultSystemPrompt, presetFor } from "../dist/prompt/presets.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const key = process.env.VISION_LIVE_KEY || process.env.VISION_OPENAI_API_KEY;
if (!key) {
  console.error("Set VISION_LIVE_KEY before running (or VISION_OPENAI_API_KEY).");
  process.exit(1);
}
const base = process.env.VISION_LIVE_BASE_URL || "https://opencode.ai/zen/go/v1";

const config = loadConfig({
  VISION_PROVIDER: "openai",
  VISION_OPENAI_BASE_URL: base,
  VISION_OPENAI_API_KEY: key,
  VISION_MODEL: process.env.VISION_LIVE_MODEL || "mimo-v2.5",
  VISION_MAX_TOKENS: "1500",
});

const provider = createProvider(config);
const cache = new ImageCache(null);
const image = await resolveImage(join(__dirname, "fixture-live.png"), {
  timeoutMs: 60_000,
  blockPrivateUrls: false,
  cache,
  clipboardConfig: { clipboardDir: ".llm-vision-mcp/clipboard" },
});

console.log(`→ sending ${image.mime} (${image.bytes.length} bytes) to ${config.model}`);
const out = await provider.chat({
  imageBytes: image.bytes,
  mime: image.mime,
  userPrompt: presetFor("describe"),
  systemPrompt: defaultSystemPrompt(),
  maxTokens: 1500,
});
console.log("MODEL:", out.model);
console.log("RESPONSE:\n", out.text);
