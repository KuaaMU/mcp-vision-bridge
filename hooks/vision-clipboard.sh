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
# Cross-platform clipboard image snapshot:
#   - Windows: PowerShell Get-Clipboard -Format Image
#   - macOS:   osascript «class PNGf» coercion (clipboard is TIFF natively)
#   - Linux:   xclip (X11) or wl-paste (Wayland)
# On platforms without a clipboard image, the hook stays silent.
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
WIN_HOME="${USERPROFILE:-$HOME}"
# Normalize to forward slashes so the injected path works on every platform
# (Windows accepts both \ and /; the vision MCP resolver handles both).
WIN_HOME_FS="$(printf '%s' "$WIN_HOME" | sed 's|\\|/|g')"
PASTE_DIR="${VISION_PASTE_DIR:-$WIN_HOME_FS/.claude/vision-paste}"
mkdir -p "$PASTE_DIR"
OUTFILE="$PASTE_DIR/paste-$(date +%Y%m%d-%H%M%S).png"

OS="$(uname -s 2>/dev/null || echo 'unknown')"
case "$OS" in
  Darwin)
    # macOS: AppleScript coerces the clipboard (TIFF) directly to PNG bytes.
    osascript -e "set h to (open for access (POSIX file \"$OUTFILE\") with write permission)" \
              -e "write (the clipboard as «class PNGf») to h" \
              -e "close access h" 2>/dev/null
    ;;
  Linux)
    # Try Wayland first, then X11.
    if command -v wl-paste >/dev/null 2>&1; then
      wl-paste --type image/png > "$OUTFILE" 2>/dev/null
    elif command -v xclip >/dev/null 2>&1; then
      xclip -selection clipboard -t image/png -o > "$OUTFILE" 2>/dev/null
    else
      exit 0
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Windows: PowerShell Get-Clipboard -Format Image, saved to $OUTFILE.
    powershell -NoProfile -Command "
      \$f = '$OUTFILE'
      try {
        \$img = Get-Clipboard -Format Image -ErrorAction SilentlyContinue
        if (\$img) {
          \$img.Save(\$f)
          Write-Output \$f
        } else { Write-Output 'NO_IMAGE' }
      } catch { Write-Output 'NO_IMAGE' }
    " 2>/dev/null | tr -d '\r' | tail -1
    ;;
  *)
    exit 0
    ;;
esac

# 4) Verify a non-empty image was actually written.
if [ ! -s "$OUTFILE" ]; then
  # Non-Windows path failed to write; also handle the Windows branch which
  # prints the actual path instead of using $OUTFILE.
  exit 0
fi

# 5) Injected context: point the agent at the snapshot file.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\\n[vision-bridge] The user copied an image and wants you to look at it. It has been snapshotted to a file:\\n  %s\\nIf you (the model) can already see image content directly, ignore this hint and analyze the image yourself. Otherwise call the analyze_image MCP tool with image=%s and an appropriate task (describe | ocr | ui | layout | qa), or a free-form prompt matching their question. If analyze_image is not available, say you cannot see the image and ask for a path.\\n"}}' "$OUTFILE" "\"$OUTFILE\""
