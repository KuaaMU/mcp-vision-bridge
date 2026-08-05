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
import { resolveImage, type ResolveOptions } from "../image/resolver.js";
import { defaultSystemPrompt, presetFor, assertTaskName } from "../prompt/presets.js";
import type { VisionProvider } from "../providers/base.js";
import { saveDescription } from "../output.js";

export interface AnalyzeImageArgs {
  image: string;
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

export async function analyzeImage(
  args: AnalyzeImageArgs,
  deps: ToolDeps,
): Promise<ToolResult> {
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

    const image = await resolveImage(args.image, resolveOptions);

    const description = await provider.chat({
      imageBytes: image.bytes,
      mime: image.mime,
      userPrompt,
      systemPrompt,
      maxTokens: detail === "high" ? config.maxTokens : Math.min(config.maxTokens, 1024),
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
