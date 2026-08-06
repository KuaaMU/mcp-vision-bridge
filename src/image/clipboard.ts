/**
 * Read an image from the system clipboard.
 *
 * Returns the raw image bytes or null when no image is on the clipboard.
 * Uses the platform-native mechanism: Windows PowerShell, macOS pbpaste, or
 * Linux xclip (the -t image/png branch — the mime probe determines the real
 * format).
 *
 * On macOS, clipboard image bytes are captured as TIFF; that path is not a
 * supported vision-input format, so we round-trip through a temp PNG file via
 * `sips` and read the re-encoded bytes back. The temp file lives in
 * `config.clipboardDir` and is removed afterwards.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { clipboardError } from "../errors.js";
import { detectMime } from "./mime.js";

const execFileP = promisify(execFile);

const MAX_CLIPBOARD_BYTES = 20 * 1024 * 1024;

export interface ClipboardConfig {
  clipboardDir: string;
}

/**
 * Resolve the current platform's clipboard image reader CLI. Returns
 * [command, args] or undefined when the platform has no supported mechanism.
 */
export function clipboardReader(
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } | undefined {
  switch (platform) {
    case "win32":
      return {
        command: "powershell",
        args: [
          "-NoProfile",
          "-Command",
          "Get-Clipboard -Format Image -ErrorAction SilentlyContinue",
        ],
      };
    case "darwin":
      return { command: "pbpaste", args: ["-Prefer", "png"] };
    case "linux":
      return { command: "xclip", args: ["-selection", "clipboard", "-t", "image/png", "-o"] };
    default:
      return undefined;
  }
}

/** Read the current clipboard image, or null if none is present. */
export async function readClipboardImage(
  platform: NodeJS.Platform = process.platform,
  config: ClipboardConfig = { clipboardDir: ".mcp-vision-bridge/clipboard" },
): Promise<Buffer | null> {
  const reader = clipboardReader(platform);
  if (reader === undefined) {
    throw clipboardError(
      `Clipboard images are not supported on this platform (${platform}). ` +
        "Use image_path, image_url, or image_data instead.",
    );
  }

  try {
    const { stdout } = await execFileP(reader.command, reader.args, {
      encoding: "buffer",
      maxBuffer: MAX_CLIPBOARD_BYTES,
    });

    const bytes = interpretClipboardStdout(stdout);
    if (bytes === null) {
      return null;
    }

    if (platform === "darwin") {
      return await macClipboardToPng(bytes, config.clipboardDir);
    }

    return bytes;
  } catch (err) {
    // No image on the clipboard typically fails the command (Windows: a
    // non-zero exit when -ErrorAction SilentlyContinue yields nothing).
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    // Treat "empty clipboard" as null, not an error.
    if (message.includes("Cannot find an overload") || code === "ENOENT") {
      return null;
    }
    if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw clipboardError("Clipboard image exceeds the 20MB size limit.");
    }
    throw clipboardError(
      `Could not read an image from the clipboard: ${message}. ` +
        "If no image is copied, pass an image_path/image_url/image_data instead.",
    );
  }
}

/**
 * Decide whether clipboard stdout actually holds an image.
 *
 * Returns null (no usable image) for empty, whitespace-only, or non-raster
 * output — PowerShell can emit \r\n / \n / spaces when the clipboard has no
 * image object, and text or other content is not a usable image either.
 */
export function interpretClipboardStdout(stdout: Buffer): Buffer | null {
  if (stdout.length === 0 || stdout.toString("utf8").trim().length === 0) {
    return null;
  }
  if (detectMime(stdout) === undefined) {
    return null;
  }
  return stdout;
}

/** macOS only: re-encode clipboard bytes to PNG via `sips`. */
async function macClipboardToPng(bytes: Buffer, clipboardDir: string): Promise<Buffer> {
  await fs.mkdir(clipboardDir, { recursive: true });
  const tmp = path.join(clipboardDir, `clip-${process.pid}-${Date.now()}.tiff`);
  const out = path.join(clipboardDir, `clip-${process.pid}-${Date.now()}.png`);
  try {
    await fs.writeFile(tmp, bytes);
    await execFileP("sips", ["-s", "format", "png", tmp, "--out", out], {
      maxBuffer: MAX_CLIPBOARD_BYTES,
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    await fs.rm(out, { force: true }).catch(() => undefined);
  }
}
