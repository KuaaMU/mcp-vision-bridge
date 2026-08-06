#!/usr/bin/env node
/**
 * vision-capture — detect whether the user pasted images into the current
 * message, for the auto-loop hook.
 *
 * This is a DETECTOR, not a snapshotter. Snapshotting to vision-paste was
 * unreliable: the session transcript is written asynchronously, so reading it
 * at UserPromptSubmit time lagged one batch behind and injected stale images.
 * Instead we only answer "did the user paste images this message?", and the
 * hook tells the agent to call analyze_image(image="session") — which reads the
 * transcript at CALL time (by then it is written) and returns every pasted
 * image, accurately and without lag.
 *
 * Signal sources (in order of reliability):
 *   1. `[Image #N]` markers in the submitted prompt (the current message's
 *      placeholders — zero lag, zero cross-message confusion).
 *   2. The session transcript contains image blocks (fallback when markers
 *      aren't in the prompt field).
 *
 * Input:  UserPromptSubmit hook JSON on stdin (fields: transcript_path,
 *         session_id, prompt).
 * Output: JSON on stdout — {"imageCount": <int>} where 0 = no images this
 *         message. The wrapper stays silent when imageCount is 0.
 *
 * Install: see hooks/vision-clipboard.sh (the wrapper that invokes this script).
 * Runtime: plain Node >= 18, zero dependencies, self-contained (does NOT import
 *          the built dist/ — hooks must not depend on build artifacts).
 */
import { existsSync, readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Home directory (USERPROFILE on Windows, HOME elsewhere). */
function homeDir() {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
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

async function main() {
  const input = await readInput();
  let imageCount = 0;

  // 1. `[Image #N]` placeholders in the submitted prompt — the most reliable
  //    signal: it's THIS message, no transcript lag.
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const markers = prompt.match(/\[Image #\d+\]/g) ?? [];
  if (markers.length > 0) {
    imageCount = markers.length;
  } else {
    // 2. Fallback: the session transcript contains image blocks.
    const transcript = await resolveTranscript(input);
    if (transcript) {
      try {
        const text = readFileSync(transcript, "utf8");
        const blocks = text.match(/\{"type":"image","source":\{"type":"base64","media_type":"[^"]+","data":"[^"]+"\}\}/g) ?? [];
        imageCount = blocks.length;
      } catch {
        /* transcript unreadable — treat as none */
      }
    }
  }

  process.stdout.write(JSON.stringify({ imageCount }));
}

main().catch(() => process.stdout.write(JSON.stringify({ imageCount: 0 })));
