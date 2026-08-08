/**
 * Batch-analyze a folder of images against the live opencode GO / mimo-v2.5
 * endpoint. Reads VISION_LIVE_KEY from the environment (never committed).
 */
import { loadConfig } from "../dist/config.js";
import { createProvider } from "../dist/providers/factory.js";
import { resolveImage } from "../dist/image/resolver.js";
import { ImageCache } from "../dist/image/cache.js";
import { defaultSystemPrompt, presetFor } from "../dist/prompt/presets.js";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const dir = process.argv[2];
const task = process.argv[3] || "describe";
const key = process.env.VISION_LIVE_KEY || process.env.VISION_OPENAI_API_KEY;
if (!key) {
  console.error("Set VISION_LIVE_KEY before running.");
  process.exit(1);
}
if (!dir) {
  console.error("Usage: node scripts/batch-analyze.mjs <dir> [task]");
  process.exit(1);
}

const config = loadConfig({
  VISION_PROVIDER: "openai",
  VISION_OPENAI_BASE_URL: process.env.VISION_LIVE_BASE_URL || "https://opencode.ai/zen/go/v1",
  VISION_OPENAI_API_KEY: key,
  VISION_MODEL: process.env.VISION_LIVE_MODEL || "mimo-v2.5",
  VISION_MAX_TOKENS: process.env.VISION_MAX_TOKENS || "1500",
});
const provider = createProvider(config);
const cache = new ImageCache(null);

const files = (await fs.readdir(dir)).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort();

console.log(`Analyzing ${files.length} images in "${dir}" with ${config.model} (task=${task})\n`);
for (const file of files) {
  const full = path.join(dir, file);
  try {
    const image = await resolveImage(full, {
      timeoutMs: 60_000,
      blockPrivateUrls: false,
      cache,
      clipboardConfig: { clipboardDir: ".llm-vision-mcp/clipboard" },
    });
    const out = await provider.chat({
      imageBytes: image.bytes,
      mime: image.mime,
      userPrompt: presetFor(task),
      systemPrompt: defaultSystemPrompt(),
      maxTokens: config.maxTokens,
    });
    console.log(`### ${file}  (${image.mime}, ${image.bytes.length} bytes)`);
    console.log(out.text);
    console.log("\n" + "─".repeat(60) + "\n");
  } catch (err) {
    console.log(`### ${file}  ERROR`);
    console.log(String(err instanceof Error ? err.message : err));
    console.log("\n" + "─".repeat(60) + "\n");
  }
}
