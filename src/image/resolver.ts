/**
 * Resolve any accepted image source to raw bytes + MIME type.
 *
 * Accepted sources:
 *   - absolute or relative local file path
 *   - http(s) URL (with optional SSRF guard)
 *   - data: URI with base64 image payload
 *   - "clipboard"  → read from the system clipboard
 *   - "raw"        → treat the string as literal raw image bytes
 *
 * All sources funnel to the same { bytes, mime } shape consumed by providers.
 */

import { promises as fs } from "node:fs";
import { imageFetchFailed, invalidInput } from "../errors.js";
import { readClipboardImage, type ClipboardConfig } from "./clipboard.js";
import { ImageCache } from "./cache.js";
import { assertSupportedImage, detectMime } from "./mime.js";

export interface ResolvedImage {
  bytes: Buffer;
  mime: string;
  /** Short human label for error messages and cache keys. */
  source: string;
}

export interface ResolveOptions {
  timeoutMs: number;
  blockPrivateUrls: boolean;
  cache: ImageCache;
  clipboardConfig: ClipboardConfig;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
}

const MAX_BYTES = 50 * 1024 * 1024;

function isHttpUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function isDataUrl(input: string): boolean {
  return /^data:([^;,]+)?(;base64)?,/.test(input);
}

/**
 * Decide what `input` refers to. Returns a discriminated "kind" plus the value
 * to look up in the cache (a canonical key for that source).
 *
 * "raw" is a literal image blob (binary string or base64). It is only
 * classified as raw when it is NOT a filesystem path and NOT a URL — otherwise
 * a legitimate path like "report.png" would be misread as raw bytes.
 */
export function classifySource(input: string): {
  kind: "path" | "url" | "data" | "clipboard" | "raw";
  cacheKey: string;
} {
  if (input === "clipboard") return { kind: "clipboard", cacheKey: "clipboard:live" };
  if (input === "raw") return { kind: "raw", cacheKey: "raw:literal" };
  if (isHttpUrl(input)) return { kind: "url", cacheKey: `url:${input}` };
  if (isDataUrl(input)) return { kind: "data", cacheKey: `data:${input.slice(0, 64)}` };
  if (looksLikeRawImage(input)) return { kind: "raw", cacheKey: `raw:${input.slice(0, 64)}` };
  return { kind: "path", cacheKey: `path:${input}` };
}

/** True when the string is plausibly a raw image blob rather than a path. */
function looksLikeRawImage(input: string): boolean {
  if (input.length < 16) return false;
  const asBytes = Buffer.from(input, "binary");
  if (detectMime(asBytes) !== undefined) return true;
  // Base64 of a small image is commonly 64+ chars. Try decoding and probing.
  if (input.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(input)) {
    const decoded = Buffer.from(input, "base64");
    if (decoded.length > 0 && detectMime(decoded) !== undefined) return true;
  }
  return false;
}

/**
 * Resolve `input` to image bytes + MIME. The cache is checked first (keyed by
 * source) and populated on miss.
 */
export async function resolveImage(
  input: string,
  opts: ResolveOptions,
): Promise<ResolvedImage> {
  const { kind, cacheKey } = classifySource(input);

  // Clipboard is inherently volatile — never cache it.
  if (kind === "clipboard") {
    const bytes = await readClipboardImage(process.platform, opts.clipboardConfig);
    if (bytes === null) {
      throw invalidInput(
        "No image was found on the clipboard. Copy an image (e.g. take a screenshot) and retry, " +
          "or pass image_path / image_url / image_data instead.",
      );
    }
    return finish(bytes, "clipboard");
  }

  if (kind === "raw") {
    const bytes = Buffer.from(input, "binary");
    return finish(bytes, "raw bytes");
  }

  const cached = await opts.cache.get(cacheKey);
  if (cached !== null) {
    return finish(cached, kind);
  }

  let bytes: Buffer;
  switch (kind) {
    case "path": {
      let resolved = input;
      if (!pathIsAbsolute(input)) {
        resolved = process.cwd() + "/" + input;
      }
      try {
        bytes = await fs.readFile(resolved);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw invalidInput(
          `Could not read image file "${input}": ${message}. ` +
            "Check that the path exists and is accessible.",
        );
      }
      break;
    }
    case "url": {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        if (opts.blockPrivateUrls && !(await isPublicUrl(input))) {
          throw imageFetchFailed(
            `URL fetch blocked by SSRF guard: "${input}" resolves to a private or local address. ` +
              "Set VISION_BLOCK_PRIVATE_URLS=false to allow it.",
          );
        }
        const response = await (opts.fetchFn ?? fetch)(input, {
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "llm-vision-mcp/0.1" },
        });
        if (!response.ok) {
          throw imageFetchFailed(`HTTP ${response.status} ${response.statusText} fetching "${input}".`);
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.length > MAX_BYTES) {
          throw imageFetchFailed(`Image at "${input}" exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.`);
        }
        bytes = buf;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw imageFetchFailed(`Timed out fetching "${input}" after ${opts.timeoutMs}ms.`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      break;
    }
    case "data": {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(input);
      if (!match) {
        throw invalidInput("Malformed data: URI. Expected data:<mime>;base64,<payload>.");
      }
      const declaredMime = match[1] ?? "";
      const isBase64 = match[2] !== undefined;
      const payload = match[3];
      try {
        bytes = isBase64
          ? Buffer.from(payload, "base64")
          : Buffer.from(payload, "utf8");
      } catch {
        throw invalidInput("data: URI payload is not valid base64.");
      }
      if (bytes.length === 0) {
        throw invalidInput("data: URI contains an empty image payload.");
      }
      // If the caller declared a mime, validate bytes match it.
      if (declaredMime && declaredMime.startsWith("image/")) {
        const detected = assertSupportedImage(bytes, "data: URI");
        if (detected !== declaredMime) {
          throw invalidInput(
            `data: URI declares "${declaredMime}" but bytes look like "${detected}".`,
          );
        }
      }
      break;
    }
    default:
      throw invalidInput(`Unhandled source kind: ${kind}`);
  }

  await opts.cache.set(cacheKey, bytes);
  return finish(bytes, kind);
}

function finish(bytes: Buffer, source: string): ResolvedImage {
  const mime = assertSupportedImage(bytes, source);
  return { bytes, mime, source };
}

function pathIsAbsolute(p: string): boolean {
  return (
    p.startsWith("/") ||
    p.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(p) ||
    p.startsWith("./") ||
    p.startsWith("../")
  );
}

/** True when the URL's hostname resolves only to public addresses. */
async function isPublicUrl(url: string): Promise<boolean> {
  try {
    const { hostname } = new URL(url);
    const address = await lookupHostname(hostname);
    return !isPrivateAddress(address);
  } catch {
    // DNS failure → treat as unsafe and block.
    return false;
  }
}

async function lookupHostname(hostname: string): Promise<string> {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "127.0.0.1";
  }
  const dns = await import("node:dns");
  const addresses = await dns.promises.lookup(hostname);
  return addresses.address;
}

/** Check RFC1918 / loopback / link-local / CGNAT ranges. */
function isPrivateAddress(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length === 4) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (address.toLowerCase().startsWith("fe80") || address === "::1") return true;
  return false;
}
