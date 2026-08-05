#!/usr/bin/env bash
# vision-bridge hook: auto-closes the loop for text-only agents.
#
# When the user submits a message that suggests they want the agent to "see"
# an image (vision keywords, or a pasted-image placeholder) AND the system
# clipboard currently holds an image, this hook injects context that tells the
# agent to call the analyze_image MCP tool with image="clipboard".
#
# The agent's own model cannot see images; this is what makes the flow feel
# automatic: paste/copy an image, type "看看这个" and the agent routes the
# pixels through the configured vision model without further prompting.
#
# Install: add to UserPromptSubmit hooks in ~/.claude/settings.json:
#   { "type": "command", "command": "bash ~/.claude/hooks/vision-clipboard.sh", "timeout": 10 }
#
# Input: hook JSON on stdin (UserPromptSubmit event).
# Output: {"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}
#   or nothing (no output) to stay silent.
set -uo pipefail

# 1) Read user prompt from stdin.
INPUT_JSON="$(cat 2>/dev/null || true)"
PROMPT="$(printf '%s' "$INPUT_JSON" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    // UserPromptSubmit payload: probe common field names.
    const p = j?.prompt ?? j?.tool_input?.prompt ?? j?.session?.prompt ?? "";
    process.stdout.write(String(p));
  } catch { process.stdout.write(""); }
});
' 2>/dev/null || true)"

# 2) Vision-intent keywords (Chinese + English).
# Also treat a pasted-image placeholder as intent.
if ! printf '%s' "$PROMPT" | grep -qEi "看图|看这个|看下|看看|分析|截图|截屏|图片|图片中|图里|OCR|报错|错误|界面|屏幕|桌面上|这个图|screenshot|image|ocr|look at|analyze this" \
   && ! printf '%s' "$PROMPT" | grep -q "Unsupported Image"; then
  exit 0
fi

# 3) Check the system clipboard for an image.
HAS_IMAGE="$(powershell -NoProfile -Command "
  try { \$img = Get-Clipboard -Format Image -ErrorAction SilentlyContinue; if (\$img) { 'yes' } else { 'no' } } catch { 'no' }
" 2>/dev/null | tr -d '\r' | tail -1)"

if [ "$HAS_IMAGE" != "yes" ]; then
  exit 0
fi

# 4) Both signals present -> inject guidance.
# The message is self-exempting: if the agent's model can already see the image
# directly, or analyze_image is not available, it should ignore this hint.
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\n[vision-bridge] The system clipboard currently holds an image, and the user's message suggests they want you to look at it. If you (the model) can already see image content directly, ignore this hint and analyze the image yourself — this MCP is only a bridge for text-only models. Otherwise, if you want to analyze/read/describe this image and the analyze_image tool IS available, call it with image=\"clipboard\" and an appropriate task (describe | ocr | ui | layout | qa), or a free-form prompt matching their question. If they gave an explicit file path or URL instead, use that. If analyze_image is NOT available, just say you cannot see the image and ask for a path or clipboard copy.\n"}}
EOF
