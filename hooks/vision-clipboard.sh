#!/usr/bin/env bash
# vision-bridge hook: auto-closes the loop for text-only agents.
#
# When the user submits a message and the system clipboard holds an image,
# this hook:
#   1. SNAPSHOTS the clipboard image to ~/.claude/vision-paste/ RIGHT NOW
#      (the moment the message is submitted, the clipboard is still the image —
#       immune to later clipboard changes, and every paste gets its own file).
#      Filenames carry a session prefix so different sessions don't mix.
#   2. Injects the ACTUAL FILE PATH into context, telling the agent to call
#      analyze_image with that path (no dependency on the clipboard).
#
# Trigger policy: snapshot whenever the clipboard holds an image, regardless
# of the prompt text. If you paste an image, it is captured. The injected
# message is self-exempting, so multimodal models ignore it.
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

INPUT_JSON="$(cat 2>/dev/null || true)"

# 1) Extract a stable session id from the hook input for per-session isolation.
#    Fall back to a process-based id when session_id is absent.
SESSION_ID="$(printf '%s' "$INPUT_JSON" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    const sid = String(j?.session_id ?? j?.session?.session_id ?? "");
    if (sid) { process.stdout.write(sid.slice(0, 8)); return; }
    // fallback: pid-based, stable for this process
    process.stdout.write(process.pid.toString(36));
  } catch { process.stdout.write(process.pid.toString(36)); }
});
' 2>/dev/null || true)"
SESSION_ID="${SESSION_ID:-$(printf '%s' "$INPUT_JSON" | node -e 'process.stdout.write(process.pid.toString(36))' 2>/dev/null)}"
SESSION_ID="${SESSION_ID:-$$}"

# 2) Snapshot the clipboard image NOW (session-isolated, timestamped file).
WIN_HOME="${USERPROFILE:-$HOME}"
# Normalize to forward slashes so the injected path works on every platform.
WIN_HOME_FS="$(printf '%s' "$WIN_HOME" | sed 's|\\|/|g')"
# Base paste dir; each session gets its own subdirectory so snapshots from
# different sessions never mix.
PASTE_ROOT="${VISION_PASTE_DIR:-$WIN_HOME_FS/.claude/vision-paste}"
PASTE_DIR="$PASTE_ROOT/$SESSION_ID"
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

# 3) Verify a non-empty image was actually written.
if [ ! -s "$OUTFILE" ]; then
  exit 0
fi

# 4) Injected context: point the agent at the snapshot file.
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"\\n[vision-bridge] The user copied an image and wants you to look at it. It has been snapshotted to a file:\\n  %s\\nIf you (the model) can already see image content directly, ignore this hint and analyze the image yourself. Otherwise call the analyze_image MCP tool with image=%s and an appropriate task (describe | ocr | ui | layout | qa), or a free-form prompt matching their question. If analyze_image is not available, say you cannot see the image and ask for a path.\\n"}}' "$OUTFILE" "\"$OUTFILE\""
