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

echo "=============================================="
echo " mcp-vision-bridge installer"
echo " Give your text-only agent eyes."
echo "=============================================="

# ---- 1. Detect platform ----
detect_platform() {
  if command -v claude >/dev/null 2>&1; then echo "claude"
  elif command -v codex >/dev/null 2>&1; then echo "codex"
  elif command -v opencode >/dev/null 2>&1; then echo "opencode"
  elif command -v kimi >/dev/null 2>&1; then echo "kimi"
  else echo "unknown"; fi
}

PLATFORM="${1:-$(detect_platform)}"
if [ "$PLATFORM" = "unknown" ]; then
  echo "Could not auto-detect your agent. Pass it explicitly:"
  echo "  ./install.sh claude | codex | opencode | kimi"
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

# ---- 3. Persist API key as env var (not in config files) ----
persist_env() {
  local var="VISION_OPENAI_API_KEY"
  # Windows Git Bash / MSYS
  if [ -n "${USERPROFILE:-}" ] && [ -f "$USERPROFILE/.bashrc" ]; then
    if ! grep -q "^export $var=" "$USERPROFILE/.bashrc"; then
      echo "export $var=\"$API_KEY\"" >> "$USERPROFILE/.bashrc"
      echo "  → wrote VISION_OPENAI_API_KEY to ~/.bashrc"
    fi
  fi
  if [ -f "$HOME/.bashrc" ] && [ "$HOME/.bashrc" != "${USERPROFILE:-}/.bashrc" ]; then
    if ! grep -q "^export $var=" "$HOME/.bashrc"; then
      echo "export $var=\"$API_KEY\"" >> "$HOME/.bashrc"
      echo "  → wrote VISION_OPENAI_API_KEY to ~/.bashrc"
    fi
  fi
  if [ -f "$HOME/.zshrc" ]; then
    if ! grep -q "^export $var=" "$HOME/.zshrc"; then
      echo "export $var=\"$API_KEY\"" >> "$HOME/.zshrc"
      echo "  → wrote VISION_OPENAI_API_KEY to ~/.zshrc"
    fi
  fi
  if [ -f "$HOME/.profile" ]; then
    if ! grep -q "^export $var=" "$HOME/.profile"; then
      echo "export $var=\"$API_KEY\"" >> "$HOME/.profile"
      echo "  → wrote VISION_OPENAI_API_KEY to ~/.profile"
    fi
  fi
}
persist_env
echo "  → VISION_OPENAI_API_KEY stored as an environment variable (not in config files)."

# ---- 4. Register the MCP server ----
case "$PLATFORM" in
  claude)
    CLAUDE_JSON="$HOME/.claude.json"
    if [ -f "$CLAUDE_JSON" ]; then
      node -e '
        const fs = require("fs");
        const p = process.argv[1];
        const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        j.mcpServers = j.mcpServers || {};
        j.mcpServers.vision = {
          command: "npx", args: ["-y", "mcp-vision-bridge"],
          env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model }
        };
        fs.writeFileSync(p, JSON.stringify(j, null, 2));
        console.log("  → registered vision MCP in ~/.claude.json");
      ' "$CLAUDE_JSON" "$ENDPOINT" "$API_KEY" "$MODEL"
    else
      echo "  → ~/.claude.json not found; register manually (see examples/claude-code.mcp.json)."
    fi
    ;;
  codex)
    CODEX_CONFIG="$HOME/.codex/config.toml"
    mkdir -p "$HOME/.codex"
    {
      echo ""
      echo "[mcp_servers.vision]"
      echo 'command = "npx"'
      echo 'args = ["-y", "mcp-vision-bridge"]'
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
      let j = {};
      try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
      j.mcp = j.mcp || {};
      j.mcp.vision = { type: "local", command: ["npx", "-y", "mcp-vision-bridge"],
        environment: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in ~/.config/opencode/opencode.json");
    ' "$OPENCODE_CONFIG" "$ENDPOINT" "$API_KEY" "$MODEL"
    ;;
  kimi)
    KIMI_JSON="$HOME/.kimi/mcp.json"
    mkdir -p "$HOME/.kimi"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const ep = process.argv[2], key = process.argv[3], model = process.argv[4];
      const j = { mcpServers: { vision: { command: "npx", args: ["-y", "mcp-vision-bridge"],
        env: { VISION_OPENAI_BASE_URL: ep, VISION_OPENAI_API_KEY: key, VISION_MODEL: model } } } };
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      console.log("  → registered vision MCP in ~/.kimi/mcp.json");
    ' "$KIMI_JSON" "$ENDPOINT" "$API_KEY" "$MODEL"
    ;;
esac

# ---- 5. Copy the vision skill ----
if [ -d "$VISION_SKILL_DIR" ]; then
  mkdir -p "$CLAUDE_SKILLS_DIR"
  cp -r "$VISION_SKILL_DIR" "$CLAUDE_SKILLS_DIR/vision"
  echo "  → installed vision skill to $CLAUDE_SKILLS_DIR/vision"
else
  echo "  → skill dir '$VISION_SKILL_DIR' not found; copy skills/vision manually."
fi

# ---- 5b. Auto-loop hook (Claude Code only) ----
# UserPromptSubmit hook: when the clipboard holds an image and the user's message
# looks like a "look at this" request, inject guidance so the agent auto-calls
# analyze_image. This is what makes the flow feel automatic.
if [ "$PLATFORM" = "claude" ]; then
  echo ""
  read -r -p "  Install the auto-loop hook (auto-detect clipboard images + guide the agent)? [Y/n] " AUTO
  if [ "$AUTO" != "n" ] && [ "$AUTO" != "N" ]; then
    mkdir -p "$HOME/.claude/hooks"
    cp "$(dirname "$0")/hooks/vision-clipboard.sh" "$HOME/.claude/hooks/vision-clipboard.sh"
    chmod +x "$HOME/.claude/hooks/vision-clipboard.sh"
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
          list.push({ hooks: [{ type: "command", command: "bash ~/.claude/hooks/vision-clipboard.sh", timeout: 10 }] });
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

# ---- 6. Done ----
echo ""
echo "=============================================="
echo " Done. Now:"
echo "  1. Restart your $PLATFORM session (so the MCP server and skill load)."
echo "  2. Screenshot an error, copy it (Ctrl+C), and tell your agent:"
echo "       \"看剪贴板，分析这个报错\""
echo "  3. The agent will call analyze_image through the vision model."
echo "=============================================="
