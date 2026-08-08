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
 * Signal: `[Image #N]` placeholders in the submitted prompt. Claude Code
 * inserts one literal `[Image #1]`, `[Image #2]`, … token per image pasted in
 * THIS message (TUI alt+V and GUI both inject them). The stripped-image case
 * arrives as `[Unsupported Image]` with no number — still a real paste, count
 * it as one. There is deliberately NO transcript fallback: scanning the whole
 * session transcript counts HISTORICAL images, not the current message, and
 * caused false positives (plain text reported as "N images").
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

/**
 * Count image placeholders in a submitted prompt.
 * `[Image #N]` → pasted image; `[Unsupported Image]` → stripped image (count 1).
 * Returns 0 for text that merely mentions a placeholder.
 */
export function countPromptMarkers(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const markers = text.match(/\[Image #\d+\]/g) ?? [];
  if (markers.length > 0) return markers.length;
  // A real paste whose image bytes were stripped (text-only gateway/model).
  return /\[Unsupported Image\]/.test(text) ? 1 : 0;
}

/**
 * Decide how many images were pasted in the current message.
 * The current prompt is the only reliable signal — the transcript is read by
 * analyze_image at call time, never here.
 */
export function detectCurrentImages({ prompt }) {
  return countPromptMarkers(prompt);
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

async function main() {
  const input = await readInput();
  const imageCount = detectCurrentImages(input);
  process.stdout.write(JSON.stringify({ imageCount }));
}

// Run only when executed directly (not when imported by tests).
const isMain =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;
if (isMain) {
  main().catch(() => process.stdout.write(JSON.stringify({ imageCount: 0 })));
}
