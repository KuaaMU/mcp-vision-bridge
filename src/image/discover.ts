/**
 * Cross-agent image discovery.
 *
 * Every agent persists pasted images somewhere predictable. Instead of relying
 * on the OS clipboard (single-image, overwritten on every copy), this module
 * finds the images a user actually pasted — newest first — across the agents
 * we support:
 *
 *   - Cowork / Claude-3p desktop:
 *       %LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions\<acct>\00000000\local_*\uploads\<uuid>-<ts>_image.png
 *   - Codex:       ~/.codex/attachments/<session>/image-*.png|jpg
 *   - Grok Build:  ~/.grok/sessions/<cwd>/<session>/images/
 *   - Claude Code: session transcripts (*.jsonl) with base64 image blocks,
 *       plus our own hook snapshots under ~/.claude/vision-paste/
 *
 * The caller (analyze_image with image="recent" / "session") uses these to
 * analyze pasted screenshots reliably, including multiple images.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";

export interface DiscoveredImage {
  /** Source label for errors/cache keys. */
  source: string;
  /** Resolvable path for files, or null when we must pass raw bytes. */
  filePath?: string;
  bytes?: Buffer;
  mime?: string;
  /** Last-modified timestamp for sorting. */
  mtimeMs: number;
}

/** Image file extensions we accept when scanning directories. */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

/** Home directory, cross-platform (USERPROFILE on Windows, HOME elsewhere). */
function homeDir(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
}

/** LocalAppData on Windows, else ~/.local/share (XDG data home). */
function localAppDataDir(): string {
  if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  const home = homeDir();
  return path.join(home, ".local", "share");
}

/** AppData on Windows, else ~/.config (XDG config home). */
function appDataDir(): string {
  if (process.env.APPDATA) return process.env.APPDATA;
  const home = homeDir();
  return path.join(home, ".config");
}

/**
 * Scan Reasonix pasted images. Reasonix is a DeepSeek-native terminal agent:
 * pasted images are written to `.reasonix/attachments/` (project-relative) and
 * sessions live under `~/.reasonix/sessions/` (or `%APPDATA%\reasonix\sessions\`
 * on Windows, or `REASONIX_STATE_HOME`). We scan the state-home sessions dir and
 * any `.reasonix` dirs in the current working directory tree.
 */
async function scanReasonix(limit: number): Promise<DiscoveredImage[]> {
  const out: DiscoveredImage[] = [];
  const roots: string[] = [];

  // 1. Sessions under the state home (or its default).
  const stateHome = process.env.REASONIX_STATE_HOME;
  if (stateHome) {
    roots.push(path.join(stateHome, "sessions"));
  } else {
    roots.push(path.join(homeDir(), ".reasonix", "sessions"));
    roots.push(path.join(appDataDir(), "reasonix", "sessions"));
  }

  // 2. Attachments in the current project tree (`.reasonix/attachments`).
  const cwd = process.cwd();
  for (let dir = cwd; dir && dir.length > 3; dir = path.dirname(dir)) {
    roots.push(path.join(dir, ".reasonix"));
  }

  for (const root of roots) {
    out.push(...(await scanDirForImages(root, "reasonix", limit)));
  }
  return out;
}

/** Scan a directory tree for image files, newest first. */
async function scanDirForImages(
  root: string,
  sourceLabel: string,
  limit: number,
): Promise<DiscoveredImage[]> {
  const out: DiscoveredImage[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && IMAGE_EXT.test(e.name)) {
        try {
          const st = await fs.stat(full);
          out.push({ source: `${sourceLabel}:${e.name}`, filePath: full, mtimeMs: st.mtimeMs });
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

/**
 * Scan Cowork / Claude-3p desktop pasted-image files.
 * Each desktop session writes pasted images to:
 *   %LOCALAPPDATA%\Claude-3p\local-agent-mode-sessions\<acct>\00000000\local_*\uploads\<uuid>-<ts>_image.png
 * Only `uploads/` dirs are scanned — the sibling `outputs/` holds agent-generated
 * previews, which must NOT be mistaken for user pastes.
 */
async function scanCoworkUploads(limit: number): Promise<DiscoveredImage[]> {
  const root = path.join(
    localAppDataDir(),
    "Claude-3p",
    "local-agent-mode-sessions",
  );
  const out: DiscoveredImage[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Descend into everything except `outputs` (agent-generated previews).
        if (e.name !== "outputs") await walk(full);
      } else if (e.isFile() && IMAGE_EXT.test(e.name) && e.name.includes("_image.")) {
        try {
          const st = await fs.stat(full);
          out.push({ source: `cowork:uploads:${e.name}`, filePath: full, mtimeMs: st.mtimeMs });
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

/** Extract base64 image blocks from a Claude Code session transcript. */
export function extractImagesFromTranscript(
  text: string,
  limit: number,
  fallbackMtime = Date.now(),
): DiscoveredImage[] {
  const out: DiscoveredImage[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (out.length >= limit) break;
    if (!rawLine.includes('"type":"image"')) continue;
    let line: Record<string, unknown>;
    try {
      line = JSON.parse(rawLine);
    } catch {
      continue;
    }
    // Use the line's real timestamp so ordering reflects when the image was
    // pasted, falling back to `fallbackMtime` for malformed/absent stamps.
    const ts = typeof line.timestamp === "string" ? Date.parse(line.timestamp) : NaN;
    const mtimeMs = Number.isFinite(ts) && ts > 0 ? ts : fallbackMtime;
    const msg = line.message as Record<string, unknown> | undefined;
    const content = (msg?.content ?? line.content) as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (out.length >= limit) break;
      if (block?.type !== "image") continue;
      const src = block.source as Record<string, unknown> | undefined;
      if (src?.type !== "base64" || typeof src.data !== "string") continue;
      try {
        const bytes = Buffer.from(src.data, "base64");
        if (bytes.length > 0) {
          out.push({
            source: "claude:transcript",
            bytes,
            mime: typeof src.media_type === "string" ? src.media_type : "image/png",
            mtimeMs,
          });
        }
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}

/** Find the most recent Claude Code session transcript under ~/.claude/projects/. */
async function findRecentTranscripts(limit: number): Promise<string[]> {
  const root = path.join(homeDir(), ".claude", "projects");
  const transcripts: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.endsWith(".jsonl")) {
        transcripts.push(full);
      }
    }
  }
  await walk(root);
  const byTime = await Promise.all(
    transcripts.map(async (t) => {
      try {
        const st = await fs.stat(t);
        return { t, m: st.mtimeMs };
      } catch {
        return { t, m: 0 };
      }
    }),
  );
  return byTime.sort((a, b) => b.m - a.m).slice(0, limit).map((x) => x.t);
}

export interface DiscoverOptions {
  /** Number of images to return, newest first. */
  limit?: number;
  /** Whether to also read Claude Code transcripts (slower). */
  includeClaudeTranscript?: boolean;
}

/**
 * Find the most recently pasted images across the agents we support.
 * Newest first, deduplicated, capped at `limit`.
 */
export async function findRecentImages(
  opts: DiscoverOptions = {},
): Promise<DiscoveredImage[]> {
  const limit = opts.limit ?? 10;
  const all: DiscoveredImage[] = [];
  const home = homeDir();

  // 1. Cowork / Claude-3p desktop pasted images (real files, no clipboard).
  all.push(...(await scanCoworkUploads(limit)));

  // 2. Codex attachments: ~/.codex/attachments/<session>/image-*.png
  const codexRoot = path.join(home, ".codex", "attachments");
  all.push(...(await scanDirForImages(codexRoot, "codex", limit)));

  // 3. Grok Build session images: ~/.grok/sessions/*/*/images/
  const grokRoot = path.join(home, ".grok", "sessions");
  all.push(...(await scanDirForImages(grokRoot, "grok", limit)));

  // 4. Reasonix (DeepSeek-native terminal agent): sessions + project attachments.
  all.push(...(await scanReasonix(limit)));

  // 5. Claude Code CLI pasted-image cache: ~/.claude/image-cache/<uuid>/N.png.
  //    This is where the CLI/TUI actually writes pasted images (both Ctrl+V and
  //    drag-drop) — each session gets its own uuid dir with numbered files.
  //    This is the authoritative source for CLI pastes, so it is scanned first.
  const imageCacheRoot = path.join(home, ".claude", "image-cache");
  all.push(...(await scanDirForImages(imageCacheRoot, "claude:image-cache", limit)));

  // 6. Claude Code transcripts (base64 image blocks) — fallback for sessions
  //    whose image-cache entries were cleaned up.
  if (opts.includeClaudeTranscript !== false) {
    const transcripts = await findRecentTranscripts(2);
    for (const t of transcripts) {
      try {
        const text = await fs.readFile(t, "utf8");
        all.push(...extractImagesFromTranscript(text, limit));
      } catch {
        /* skip */
      }
    }
  }

  // Newest first, dedupe by filePath (or content hash for in-memory bytes),
  // cap at limit.
  all.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const seen = new Set<string>();
  const unique: DiscoveredImage[] = [];
  for (const img of all) {
    const key = img.filePath ?? (img.bytes ? contentHash(img.bytes) : img.source);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(img);
    if (unique.length >= limit) break;
  }
  return unique;
}

/** sha1 hex prefix — content identity for deduping in-memory image bytes. */
function contentHash(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("hex").slice(0, 16);
}
