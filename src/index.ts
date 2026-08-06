#!/usr/bin/env node
/**
 * llm-vision-mcp — Model Context Protocol server that gives text-only LLM
 * coding agents vision.
 *
 * The server exposes a single `analyze_image` tool. A text-only agent calls it
 * with an image source (path / URL / data-URI / clipboard / raw bytes) and a
 * question; the server resolves the image, sends it to the configured
 * multimodal model, and returns a detailed, standalone text description the
 * agent can reason over.
 *
 * Providers (VISION_PROVIDER): "openai" (default, OpenAI-compatible — covers
 * OpenRouter, Chinese gateways, opencode GO endpoints, mimo), "anthropic", or
 * "gemini". All configuration is via environment variables; keys never appear
 * in tool arguments.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { ImageCache } from "./image/cache.js";
import { createProvider } from "./providers/factory.js";
import { makeAnalyzeHandler, type AnalyzeImageArgs } from "./tool/analyze-image.js";
import { selfSync } from "./self-sync.js";

export function buildServer(config = loadConfig()) {
  const cache = new ImageCache(config.cacheDir);
  const provider = createProvider(config);
  const handleAnalyzeImage = makeAnalyzeHandler({ config, provider, cache });

  const server = new McpServer({
    name: "llm-vision-mcp",
    version: "0.1.0",
  });

  server.tool(
    "analyze_image",
    [
      "Analyze an image using a multimodal model and return a detailed text description.",
      "The vision model sees the image; the calling agent is text-only and cannot.",
      "",
      "Sources for `image` (pick one, or pass an array to analyze several at once):",
      '  - "path": absolute or relative path to a local image file (PNG/JPEG/WEBP/GIF)',
      "  - URL: http(s) URL to an image on the web or a local server",
      '  - "data:...": base64 data URI, e.g. data:image/png;base64,<payload>',
      '  - "clipboard": read the image currently copied to the system clipboard',
      '  - "recent": auto-find the most recently pasted image in THIS session',
      '  - "session": auto-find EVERY image pasted in this session (analyze them all in one call)',
      '  - "raw": the string itself is the literal raw image bytes',
      '  - ["a.png", "b.png", ...]: array of any of the above — all analyzed in one request',
      "",
      "Pick `task` for common jobs (describe | ocr | ui | layout | qa) or pass your own `prompt`.",
      "`detail` defaults to \"high\" for maximum completeness.",
      "Use `save_to` to write a long description to a file and get back only a path + summary.",
    ].join("\n"),
    {
      image: z
        .union([z.string().min(1), z.array(z.string().min(1))])
        .describe(
          "Image source(s): a file path, URL, data: URI, 'clipboard', 'recent', 'session', 'raw', or an array of any of these to analyze multiple images in one call. 'session' analyzes every image pasted in the current session.",
        ),
      prompt: z
        .string()
        .optional()
        .describe("Free-form question or instruction about the image. Overrides `task`."),
      task: z
        .enum(["describe", "ocr", "ui", "layout", "qa"])
        .optional()
        .describe("Common analysis task. Ignored when `prompt` is provided."),
      detail: z
        .enum(["low", "high"])
        .optional()
        .describe("Desired detail level. Defaults to 'high'."),
      save_to: z
        .string()
        .optional()
        .describe("Optional file path (.txt/.md) to write the full description to."),
    },
    async (rawArgs) => {
      return handleAnalyzeImage(rawArgs as AnalyzeImageArgs);
    },
  );

  return server;
}

export async function main(): Promise<void> {
  // Sync the bundled skill + hook into the user's ~/.claude so they track the
  // npm package version. Silent: a failure must never block the MCP server.
  await selfSync().catch(() => {});
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// `import` entrypoints use main() explicitly; `node dist/index.js` runs it.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
