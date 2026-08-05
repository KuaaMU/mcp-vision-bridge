#!/usr/bin/env node
/**
 * vision-capture — extract images pasted into a Claude Code session from the
 * session transcript, and image file paths from the submitted prompt.
 *
 * Replaces the old clipboard-snapshot approach. The OS clipboard can hold only
 * ONE image, so pasting 3 images lost 2, and copying text afterward erased the
 * only snapshot. Claude Code writes every pasted image as a base64 block in the
 * session transcript (lossless, multi-image), so we read the transcript instead.
 *
 * Input:  UserPromptSubmit hook JSON on stdin (fields: transcript_path,
 *         session_id, prompt).
 * Output: JSON on stdout — {"images":[{"path","source"}]}. Only images that are
 *         NEW since the last run are included (dedup by sha1). Empty images =
 *         nothing new, caller stays silent.
 *
 * Install: see hooks/vision-clipboard.sh (the wrapper that invokes this script).
 * Runtime: plain Node >= 18, zero dependencies, self-contained (does NOT import
 *          the built dist/ — hooks must not depend on build artifacts).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Home directory (USERPROFILE on Windows, HOME elsewhere). */
function homeDir() {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
}

/** Default paste root; override with VISION_PASTE_DIR for testing. */
function pasteRoot() {
  return process.env.VISION_PASTE_DIR ?? path.join(homeDir(), ".claude", "vision-paste");
}

/** sha1 hex prefix of image bytes — the dedup key. */
function hash(bytes) {
  return createHash("sha1").update(bytes).digest("hex").slice(0, 8);
}

/** Read and parse the hook JSON from stdin. */
async function readInput() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/** Parse the transcript text, returning image blocks as { mime, bytes }. */
function extractImages(text) {
  const out = [];
  const re = /\{"type":"image","source":\{"type":"base64","media_type":"([^"]+)","data":"([^"]+)"\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const bytes = Buffer.from(m[2], "base64");
      if (bytes.length > 0) out.push({ mime: m[1], bytes });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

/** Resolve the session transcript path from the hook input. */
async function resolveTranscript(input) {
  if (typeof input.transcript_path === "string" && input.transcript_path) {
    if (existsSync(input.transcript_path)) return input.transcript_path;
  }
  // Fallback: derive from session_id under ~/.claude/projects/*/<session_id>.jsonl
  const sid = typeof input.session_id === "string" ? input.session_id : "";
  if (sid) {
    const projectsRoot = path.join(homeDir(), ".claude", "projects");
    if (existsSync(projectsRoot)) {
      const { readdir } = await import("node:fs/promises");
      try {
        const dirs = await readdir(projectsRoot);
        for (const d of dirs) {
          const p = path.join(projectsRoot, d, `${sid}.jsonl`);
          if (existsSync(p)) return p;
        }
      } catch {
        /* no transcript */
      }
    }
  }
  return null;
}

/** Extract image file paths from the submitted prompt (drag-dropped files). */
function extractPromptPaths(prompt, max) {
  const out = [];
  const re = /(?:[A-Za-z]:[\\/]|\/)[^\s"']+?\.(png|jpe?g|gif|webp)(?:["'\s]|$)/gi;
  let m;
  while ((m = re.exec(prompt)) !== null && out.length < max) {
    const p = m[0].replace(/["'\s]+$/, "");
    if (existsSync(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

/** Write image bytes to the session paste dir, deduped by sha1. */
function saveImages(input, images) {
  const sid = (typeof input.session_id === "string" ? input.session_id : "unknown").slice(0, 8);
  const dir = path.join(pasteRoot(), sid);
  mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const img of images) {
    const h = hash(img.bytes);
    const ext = MIME_EXT[img.mime] ?? "png";
    const file = path.join(dir, `img-${h}.${ext}`);
    if (existsSync(file)) continue; // already captured
    writeFileSync(file, img.bytes);
    saved.push({ path: file, source: `claude:transcript` });
  }
  return saved;
}

async function main() {
  const input = await readInput();
  const images = [];

  // 1. Transcript base64 blocks (multi-image, lossless).
  const transcript = await resolveTranscript(input);
  if (transcript) {
    try {
      const text = readFileSync(transcript, "utf8");
      const blocks = extractImages(text);
      if (blocks.length > 0) images.push(...saveImages(input, blocks));
    } catch {
      /* transcript unreadable — skip */
    }
  }

  // 2. Drag-dropped image paths from the prompt (zero race, no clipboard).
  if (typeof input.prompt === "string" && input.prompt) {
    const paths = extractPromptPaths(input.prompt, 10);
    for (const p of paths) {
      images.push({ path: p, source: "prompt:path" });
    }
  }

  // Dedup by path before emitting (transcript and prompt may overlap).
  const seen = new Set();
  const unique = images.filter((i) => {
    if (seen.has(i.path)) return false;
    seen.add(i.path);
    return true;
  });

  process.stdout.write(JSON.stringify({ images: unique }));
}

main().catch(() => process.stdout.write(JSON.stringify({ images: [] })));
