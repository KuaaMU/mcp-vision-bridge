#!/usr/bin/env bash
# vision-bridge hook: auto-closes the loop for text-only agents.
#
# When the user submits a message that suggests they want the agent to "see"
# an image (vision keywords, or a pasted-image placeholder) AND the system
# clipboard currently holds an image, this hook:
#   1. SNAPSHOTS the clipboard image to ~/.claude/vision-paste/ RIGHT NOW
#      (the moment the message is submitted, the clipboard is still the image —
#       this is immune to later text copies overwriting it, and supports
#       multiple pastes each getting their own timestamped file).
#   2. Injects the ACTUAL FILE PATH into context, telling the agent to call
#      analyze_image with that path (no dependency on the clipboard).
#
# This is the robust fix for: multiple images, mixed text/image copies, and
# clipboard read-timing races.
#
# Install: add to UserPromptSubmit hooks in ~/.claude/settings.json:
#   { "type": "command", "command": "bash ~/.claude/hooks/vision-clipboard.sh", "timeout": 15 }
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

# 3) Snapshot the clipboard image NOW (timestamped file).
# Use USERPROFILE (Windows native path) — $HOME in Git Bash is a /c/Users/... MSYS
# path that PowerShell can't resolve.
WIN_HOME="${USERPROFILE:-$HOME}"
PASTE_DIR="${VISION_PASTE_DIR:-$WIN_HOME/.claude/vision-paste}"
mkdir -p "$PASTE_DIR"
SNAP="$(powershell -NoProfile -Command "
  \$dir = '$PASTE_DIR'
  try {
    \$img = Get-Clipboard -Format Image -ErrorAction SilentlyContinue
    if (\$img) {
      \$f = Join-Path \$dir ('paste-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '.png')
      \$img.Save(\$f)
      Write-Output \$f
    } else { Write-Output 'NO_IMAGE' }
  } catch { Write-Output 'NO_IMAGE' }
" 2>/dev/null | tr -d '\r' | tail -1)"

if [ "$SNAP" = "NO_IMAGE" ] || [ -z "$SNAP" ]; then
  exit 0
fi

# 4) Injected context: point the agent at the snapshot file.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\\n[vision-bridge] The user copied an image and wants you to look at it. It has been snapshotted to a file:\\n  %s\\nIf you (the model) can already see image content directly, ignore this hint and analyze the image yourself. Otherwise call the analyze_image MCP tool with image=%s and an appropriate task (describe | ocr | ui | layout | qa), or a free-form prompt matching their question. If analyze_image is not available, say you cannot see the image and ask for a path.\\n"}}' "$SNAP" "\"$SNAP\""
