#!/usr/bin/env bash
#
# mcp-vision-bridge — one-click installer
#
# Installs the vision MCP server for your coding agent and drops the `vision`
# skill into place so the agent knows HOW to use it.
#
# What it does:
#   1. Detects your agent platform (Claude Code / Codex / opencode / Kimi Code).
#   2. Prompts for the vision model endpoint, API key, and model name.
#   3. Writes the API key into your shell profile (env var), NOT into JSON configs.
#   4. Registers the MCP server in your platform's config.
#   5. Copies the `vision` skill to ~/.claude/skills/vision/.
#   6. Tells you to restart your agent.
#
set -euo pipefail

VISION_SKILL_DIR="${VISION_SKILL_DIR:-skills/vision}"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# Choose the server launch command: prefer a globally-installed binary, else npx.
if command -v mcp-vision-bridge >/dev/null 2>&1; then
  MCP_CMD='mcp-vision-bridge'
  MCP_ARGS=''
else
  MCP_CMD='npx'
  MCP_ARGS='-y mcp-vision-bridge'
fi

echo "=============================================="
echo " mcp-vision-bridge installer"
echo " Give your text-only agent eyes."
echo "=============================================="
echo "  server launch: $MCP_CMD $MCP_ARGS"

# ---- 1. Detect platform ----
detect_platform() {
  if command -v claude >/dev/null 2>&1; then echo "claude"
  elif command -v reasonix >/dev/null 2>&1; then echo "reasonix"
  elif command -v codex >/dev/null 2>&1; then echo "codex"
  elif command -v opencode >/dev/null 2>&1; then echo "opencode"
  elif command -v kimi >/dev/null 2>&1; then echo "kimi"
  else echo "unknown"; fi
}

PLATFORM="${1:-$(detect_platform)}"
if [ "$PLATFORM" = "unknown" ]; then
  echo "Could not auto-detect your agent. Pass it explicitly:"
  echo "  ./install.sh claude | reasonix | codex | opencode | kimi | cowork"
  exit 1
fi
echo "Detected platform: $PLATFORM"

# ---- 2. Collect configuration ----
echo ""
echo "Your vision model connection (all required):"
read -r -p "  OpenAI-compatible endpoint URL [e.g. https://opencode.ai/zen/go/v1]: " ENDPOINT
read -r -p "  API key: " API_KEY
read -r -p "  Vision model id [e.g. mimo-v2.5, gpt-4o]: " MODEL

if [ -z "$ENDPOINT" ] || [ -z "$API_KEY" ] || [ -z "$MODEL" ]; then
  echo "All three values are required. Aborting."
  exit 1
fi

# ---- 3. The API key lives ONLY in the MCP server config env (below) — not in
# the shell profile. That keeps it scoped to the vision MCP process, avoids
# duplicate/conflicting definitions, and stays consistent across shells.
echo "  → VISION_OPENAI_API_KEY will be stored in the MCP server config (env), not the shell profile."

# ---- 4. Register the MCP server ----
case "$PLATFORM" in
  claude)
    CLAUDE_JSON="$HOME/.claude.json"
    if [ -f "$CLAUDE_JSON" ]; then
      node -e '
        const fs = require("fs");
        const p = process.argv[1];
        const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
        const cmd = process.argv[5], argsStr = process.argv[6];
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        j.mcpServers = j.mcpServers || {};
        const args = argsStr ? argsStr.split(" ") : [];
        j.mcpServers.vision = { command: cmd, args, env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } };
        fs.writeFileSync(p, JSON.stringify(j, null, 2));
        console.log("  → registered vision MCP in ~/.claude.json");
      ' "$CLAUDE_JSON" "$ENDPOINT" "$API_KEY" "$MODEL" "$MCP_CMD" "$MCP_ARGS"
    else
      echo "  → ~/.claude.json not found; register manually (see examples/claude-code.mcp.json)."
    fi
    ;;
  reasonix)
    # Reasonix supports the same .mcp.json mcpServers format as Claude Code.
    REASONIX_MCP=".mcp.json"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
      const cmd = process.argv[5], argsStr = process.argv[6];
      let j = {};
      try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
      j.mcpServers = j.mcpServers || {};
      const args = argsStr ? argsStr.split(" ") : [];
      j.mcpServers.vision = { command: cmd, args,
        env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in ./" + p);
    ' "$REASONIX_MCP" "$ENDPOINT" "$API_KEY" "$MODEL" "$MCP_CMD" "$MCP_ARGS"
    ;;
  codex)
    CODEX_CONFIG="$HOME/.codex/config.toml"
    mkdir -p "$HOME/.codex"
    {
      echo ""
      echo "[mcp_servers.vision]"
      echo "command = \"$MCP_CMD\""
      if [ -n "$MCP_ARGS" ]; then
        echo "args = [$MCP_ARGS]" | sed 's/mcp-vision-bridge/"mcp-vision-bridge"/g; s/-y/"-y"/g'
      fi
      echo "env = { VISION_OPENAI_BASE_URL = \"$ENDPOINT\", VISION_OPENAI_API_KEY = \"$API_KEY\", VISION_MODEL = \"$MODEL\" }"
    } >> "$CODEX_CONFIG"
    echo "  → registered vision MCP in ~/.codex/config.toml"
    ;;
  opencode)
    OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"
    mkdir -p "$(dirname "$OPENCODE_CONFIG")"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
      const cmd = process.argv[5], argsStr = process.argv[6];
      let j = {};
      try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
      j.mcp = j.mcp || {};
      const args = argsStr ? argsStr.split(" ") : [];
      j.mcp.vision = { type: "local", command: [cmd, ...args],
        environment: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in ~/.config/opencode/opencode.json");
    ' "$OPENCODE_CONFIG" "$ENDPOINT" "$API_KEY" "$MODEL" "$MCP_CMD" "$MCP_ARGS"
    ;;
  kimi)
    KIMI_JSON="$HOME/.kimi/mcp.json"
    mkdir -p "$HOME/.kimi"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
      const cmd = process.argv[5], argsStr = process.argv[6];
      const args = argsStr ? argsStr.split(" ") : [];
      const j = { mcpServers: { vision: { command: cmd, args, env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } } } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in ~/.kimi/mcp.json");
    ' "$KIMI_JSON" "$ENDPOINT" "$API_KEY" "$MODEL" "$MCP_CMD" "$MCP_ARGS"
    ;;
esac

# ---- 5. Copy the vision skill (Claude Code only; the skill lives in ~/.claude) ----
if [ "$PLATFORM" = "claude" ]; then
  if [ -d "$VISION_SKILL_DIR" ]; then
    mkdir -p "$CLAUDE_SKILLS_DIR"
    cp -r "$VISION_SKILL_DIR" "$CLAUDE_SKILLS_DIR/vision"
    echo "  → installed vision skill to $CLAUDE_SKILLS_DIR/vision"
  else
    echo "  → skill dir '$VISION_SKILL_DIR' not found; copy skills/vision manually."
  fi
fi

# ---- 5b. Auto-loop hook (Claude Code only) ----
# UserPromptSubmit hook: extracts images the user pasted (from the session
# transcript — lossless, multi-image) plus drag-dropped file paths from the
# prompt, and injects the paths so the agent auto-calls analyze_image.
if [ "$PLATFORM" = "claude" ]; then
  echo ""
  read -r -p "  Install the auto-loop hook (auto-capture pasted images + guide the agent)? [Y/n] " AUTO
  if [ "$AUTO" != "n" ] && [ "$AUTO" != "N" ]; then
    mkdir -p "$HOME/.claude/hooks"
    cp "$(dirname "$0")/hooks/vision-clipboard.sh" "$HOME/.claude/hooks/vision-clipboard.sh"
    cp "$(dirname "$0")/hooks/vision-capture.mjs" "$HOME/.claude/hooks/vision-capture.mjs"
    chmod +x "$HOME/.claude/hooks/vision-clipboard.sh" "$HOME/.claude/hooks/vision-capture.mjs"
    SETTINGS="$HOME/.claude/settings.json"
    if [ -f "$SETTINGS" ]; then
      node -e '
        const fs = require("fs");
        const p = process.argv[1];
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        j.hooks = j.hooks || {};
        const list = j.hooks.UserPromptSubmit || [];
        const exists = list.some(e => JSON.stringify(e).includes("vision-clipboard"));
        if (!exists) {
          list.push({ hooks: [{ type: "command", command: "bash ~/.claude/hooks/vision-clipboard.sh", timeout: 15 }] });
          j.hooks.UserPromptSubmit = list;
          fs.writeFileSync(p, JSON.stringify(j, null, 2));
          console.log("  → installed auto-loop hook in ~/.claude/settings.json");
        } else {
          console.log("  → auto-loop hook already present (skipped)");
        }
      ' "$SETTINGS"
    else
      echo "  → ~/.claude/settings.json not found; hook not installed (add manually)."
    fi
  fi
fi

# ---- 5c. Cowork / Claude-3p desktop (optional) ----
# Cowork (Claude-3p desktop) uses the same text-only model, so it also needs the
# vision MCP. It saves pasted images to real files automatically (no hook needed);
# analyze_image(image="recent"/"session") discovers them. Register the MCP server
# into %LOCALAPPDATA%\Claude-3p\claude_desktop_config.json with a backup.
if [ "$PLATFORM" = "cowork" ] || [ -n "$COWORK_INSTALL" ]; then
  COWORK_CONFIG="${LOCALAPPDATA:-$HOME/AppData/Local}/Claude-3p/claude_desktop_config.json"
  if [ -f "$COWORK_CONFIG" ]; then
    cp "$COWORK_CONFIG" "$COWORK_CONFIG.bak.$(date +%Y%m%d-%H%M%S)"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
      const cmd = process.argv[5], argsStr = process.argv[6];
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      j.mcpServers = j.mcpServers || {};
      const args = argsStr ? argsStr.split(" ") : [];
      j.mcpServers.vision = { command: cmd, args, env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in Cowork config (backed up)");
    ' "$COWORK_CONFIG" "$ENDPOINT" "$API_KEY" "$MODEL" "$MCP_CMD" "$MCP_ARGS"
  else
    echo "  → Cowork config not found; skip or set COWORK_INSTALL=1 with correct path."
  fi
fi

# ---- 6. Done ----
echo ""
echo "=============================================="
echo " Done. Now:"
echo "  1. Restart your $PLATFORM session (so the MCP server and skill load)."
echo "  2. Paste a screenshot (or drag an image) and tell your agent:"
echo "       \"看看这张图，分析这个报错\""
echo "  3. The agent will call analyze_image through the vision model."
echo "  Tip: analyze_image(image=\"recent\") auto-finds the image you pasted in"
echo "       Claude Code, Cowork, or Codex — no clipboard needed."
echo "=============================================="
