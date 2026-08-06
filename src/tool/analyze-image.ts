/**
 * `analyze_image` tool handler.
 *
 * The single, universal entry point: take any supported image source, send it
 * to the configured multimodal model, and return a detailed text description.
 * Works identically across Claude Code, PI, Codex, Kimi Code, opencode, and
 * any other MCP client.
 */

import type { Config } from "../config.js";
import { VisionError } from "../errors.js";
import { ImageCache } from "../image/cache.js";
import { resolveImages, type ResolveOptions } from "../image/resolver.js";
import { defaultSystemPrompt, presetFor, assertTaskName } from "../prompt/presets.js";
import type { VisionProvider } from "../providers/base.js";
import { saveDescription } from "../output.js";

export interface AnalyzeImageArgs {
  image: string | string[];
  prompt?: string;
  task?: string;
  detail?: "low" | "high";
  save_to?: string;
}

export interface ToolDeps {
  config: Config;
  provider: VisionProvider;
  cache: ImageCache;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

export function makeAnalyzeHandler(deps: ToolDeps) {
  return async function handleAnalyzeImage(args: AnalyzeImageArgs): Promise<ToolResult> {
    try {
      return await analyzeImage(args, deps);
    } catch (err) {
      if (err instanceof VisionError) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Unexpected error: ${message}` }],
        isError: true,
      };
    }
  };
}

export async function analyzeImage(args: AnalyzeImageArgs, deps: ToolDeps): Promise<ToolResult> {
  try {
    const { config, provider, cache } = deps;
    const task = args.task !== undefined ? assertTaskName(args.task) : "describe";
    const userPrompt = args.prompt?.trim() || presetFor(task);
    const systemPrompt = defaultSystemPrompt();
    const detail = args.detail ?? "high";

    const resolveOptions: ResolveOptions = {
      timeoutMs: config.timeoutMs,
      blockPrivateUrls: config.blockPrivateUrls,
      cache,
      clipboardConfig: { clipboardDir: config.clipboardDir },
    };

    // Accept a single source or an array; "session"/"recent" expand to the
    // current session's pasted images so several can be analyzed in one call.
    const sources = Array.isArray(args.image) ? args.image : [args.image];
    const resolved = await resolveImages(sources, resolveOptions);
    if (resolved.length === 0) {
      return {
        content: [{ type: "text", text: "Error: No images were resolved for analysis." }],
        isError: true,
      };
    }

    // Token budget per image. Defaults low enough to be cheap but high enough
    // for dense screenshots / detailed descriptions; users can raise it via
    // VISION_MAX_TOKENS. Each image gets its OWN budget — multi-image multiplies
    // the per-image budget, never dilutes it, so N images get N× detail room.
    const perImageBudget = detail === "high" ? Math.max(config.maxTokens, 4096) : 1024;
    const maxTokens = Math.min(perImageBudget * resolved.length, 32000);

    const description = await provider.chat({
      images: resolved.map((r) => ({ bytes: r.bytes, mime: r.mime })),
      userPrompt,
      systemPrompt,
      maxTokens,
    });

    if (args.save_to) {
      const saved = await saveDescription(args.save_to, description.text);
      return {
        content: [
          {
            type: "text",
            text:
              `Full description written to: ${saved}\n\n` +
              `--- Summary (first 2000 chars) ---\n${description.text.slice(0, 2000)}`,
          },
        ],
      };
    }

    return { content: [{ type: "text", text: description.text }] };
  } catch (err) {
    if (err instanceof VisionError) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Unexpected error: ${message}` }],
      isError: true,
    };
  }
}
