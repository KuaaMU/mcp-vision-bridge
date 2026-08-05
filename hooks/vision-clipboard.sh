#!/usr/bin/env bash
# vision-bridge hook: make pasted images visible to text-only agents.
#
# Replaces the old clipboard-snapshot approach (which lost all but the last
# image and nothing after text was copied). Claude Code writes every pasted
# image as a base64 block in the session transcript (lossless, multi-image), so
# this hook extracts them from the transcript + drag-dropped file paths from the
# prompt, and injects the resulting paths into context.
#
# Cross-agent note: Cowork (Claude-3p desktop) and Codex save pasted images as
# real files automatically; analyze_image(image="recent"/"session") discovers
# those via findRecentImages. This hook covers Claude Code CLI (TUI + GUI),
# whose images live only in the transcript.
#
# Install: add to UserPromptSubmit hooks in ~/.claude/settings.json:
#   { "type": "command", "command": "bash ~/.claude/hooks/vision-clipboard.sh", "timeout": 15 }
#
# Input: hook JSON on stdin (UserPromptSubmit event).
# Output: {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}
#   or nothing (no output) to stay silent when no new image was captured.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1) Extract any newly-pasted images from the transcript + prompt paths.
CAPTURE_JSON="$(cat 2>/dev/null | node "$HOOK_DIR/vision-capture.mjs" 2>/dev/null || true)"

# 2) If nothing new was captured, stay silent.
IMAGES="$(printf '%s' "$CAPTURE_JSON" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    const imgs = Array.isArray(j?.images) ? j.images : [];
    if (imgs.length === 0) { process.exit(0); }
    process.stdout.write(imgs.map(i => i.path).join("\n"));
  } catch { process.exit(0); }
});
' 2>/dev/null || true)"

if [ -z "$IMAGES" ]; then
  exit 0
fi

# 3) Build a path list for the injected message.
PATH_LIST=""
while IFS= read -r p; do
  [ -z "$p" ] && continue
  PATH_LIST="${PATH_LIST}\n  ${p}"
done <<< "$IMAGES"
COUNT="$(printf '%s\n' "$IMAGES" | grep -c . )"

# 4) Inject the captured image paths into the agent's context.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\\n[vision-bridge] The user pasted %s image(s). They have been captured and saved to these files:\\n%s\\nIf you (the model) can already see image content directly, ignore this hint and analyze the image yourself. Otherwise call the analyze_image MCP tool with image=\\"recent\\" (most recent) or an explicit file path, plus an appropriate task (describe | ocr | ui | layout | qa) or a free-form prompt matching their question. If analyze_image is not available, say you cannot see the image and ask for a path.\\n"}}' "$COUNT" "$PATH_LIST"
