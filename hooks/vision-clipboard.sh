#!/usr/bin/env bash
# vision-bridge hook: tell the agent to look at pasted images.
#
# Detects whether the user pasted images into the current message and, if so,
# injects a hint so the agent calls analyze_image(image="session") — which reads
# the session transcript directly and returns every pasted image in one call.
#
# Why not snapshot to files anymore: the transcript is written asynchronously,
# so reading it at hook time lagged one batch behind and injected stale images
# (a 2+3+3 paste sequence looked at batch 2 when batch 3 arrived). The MCP tool
# reads the transcript at CALL time (by then it is written), so image="session"
# is always accurate.
#
# Install: add to UserPromptSubmit hooks in ~/.claude/settings.json:
#   { "type": "command", "command": "bash ~/.claude/hooks/vision-clipboard.sh", "timeout": 15 }
#
# Input: hook JSON on stdin (UserPromptSubmit event).
# Output: {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}
#   or nothing (no output) to stay silent when no image was pasted.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1) Detect how many images were pasted in this message.
DETECT_JSON="$(cat 2>/dev/null | node "$HOOK_DIR/vision-capture.mjs" 2>/dev/null || true)"
COUNT="$(printf '%s' "$DETECT_JSON" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    const n = Number(j?.imageCount) || 0;
    process.stdout.write(String(n));
  } catch { process.stdout.write("0"); }
});
' 2>/dev/null || echo 0)"

if [ -z "$COUNT" ] || [ "$COUNT" = "0" ]; then
  exit 0
fi

# 2) Inject a hint: use image="session" so ALL pasted images are analyzed at once.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\\n[vision-bridge] The user pasted %s image(s) in this message. Call analyze_image with image=\\"session\\" (analyzes every image pasted in this session, in one call) and a prompt matching their question. Do not loop per-image — pass them all at once. If you (the model) can already see the image content directly, ignore this hint and analyze the image yourself. If analyze_image is not available, say you cannot see the images and ask the user for file paths.\\n"}}' "$COUNT"
