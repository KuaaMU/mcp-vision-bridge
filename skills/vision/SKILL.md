---
name: vision
description: Give the agent vision when the model itself is text-only (no image input). Use this skill whenever the user asks you to look at, analyze, describe, read, or OCR any image — a screenshot, a photo, a diagram, a UI, a chart, an error dialog, a pasted picture, or anything visual. Also triggers when the user pastes an image and you receive an "[Unsupported Image]" placeholder. Use the vision MCP tool (analyze_image) to turn any image into text you can reason over. If analyze_image is not available, guide the user through installation first (Section A), then use it (Section B).
---

# Vision for a text-only agent

Your model cannot receive image content directly. When the user pastes an image,
Claude Code shows it as an `[Unsupported Image]` placeholder — a text marker with
**no usable pixel data**. You cannot read it. Instead, obtain the image through a
route you can access, then send it through the `analyze_image` MCP tool, which
forwards the pixels to a multimodal model and returns a detailed text description.

This skill has two parts:
- **A. Install** — if `analyze_image` is not available, get it configured.
- **B. Use** — how to route any image through `analyze_image`.

---

## A. Install (run only if `analyze_image` is missing)

**First check: is `analyze_image` available?** If you can see `analyze_image` among
your MCP tools, skip to **B**. If it is NOT in your tool list, the vision MCP is
not configured yet. Do the following.

**A1. Fast path — one-click installer (recommended):**

If the repo is available on the machine, tell the user to run:

```bash
cd mcp-vision-bridge   # wherever the repo is cloned
./install.sh
```

The installer will:
1. Detect the agent platform (Claude Code / Codex / opencode / Kimi Code).
2. Prompt for the vision model endpoint, API key, and model name.
3. Write the API key into the shell profile (env var) — NOT into config files.
4. Write the MCP server config into the platform's config file.
5. Copy this skill into place.
6. Optionally install the **auto-loop hook** (Claude Code): a UserPromptSubmit
   hook that snapshots any clipboard image to a session-isolated file whenever
   you submit a message, so pasted screenshots are captured automatically.
7. Print "restart your agent" instructions.

> **If a `[vision-bridge]` system message appears in your context**, that's the
> auto-loop hook firing: the user copied an image and wants you to look at it.
> Follow it — call `analyze_image` with the snapshot path it gives you.

**A2. Manual path — no repo on machine:**

Ask the user for three values (all required):
- **`VISION_OPENAI_BASE_URL`** — their OpenAI-compatible endpoint
  (e.g. `https://opencode.ai/zen/go/v1`, OpenRouter, a gateway, or local).
- **`VISION_OPENAI_API_KEY`** — their API key.
- **`VISION_MODEL`** — the vision model id (e.g. `mimo-v2.5`, `gpt-4o`, `qwen-vl-max`).

Then guide them through the config for their platform (from the repo's
`examples/` or README):

- **Claude Code** — add a `vision` server to MCP config:
  ```json
  {
    "mcpServers": {
      "vision": {
        "command": "npx",
        "args": ["-y", "mcp-vision-bridge"],
        "env": {
          "VISION_OPENAI_BASE_URL": "<their endpoint>",
          "VISION_OPENAI_API_KEY": "<their key>",
          "VISION_MODEL": "<their model>"
        }
      }
    }
  }
  ```
  (For a project: `.mcp.json`. For global: `claude mcp add --scope user` or edit
  `~/.claude.json` top-level `mcpServers`.)

- **Codex** — `~/.codex/config.toml`:
  ```toml
  [mcp_servers.vision]
  command = "npx"
  args = ["-y", "mcp-vision-bridge"]
  env = { VISION_OPENAI_BASE_URL = "<endpoint>", VISION_OPENAI_API_KEY = "<key>", VISION_MODEL = "<model>" }
  ```
- **opencode** — `opencode.json`:
  ```json
  { "mcp": { "vision": { "type": "local", "command": ["npx","-y","mcp-vision-bridge"], "environment": { "VISION_OPENAI_BASE_URL": "<endpoint>", "VISION_OPENAI_API_KEY": "<key>", "VISION_MODEL": "<model>" } } } }
  ```
- **Kimi Code / others** — same `npx -y mcp-vision-bridge` stdio pattern.

> **Security:** prefer storing the API key in an env var
> (`export VISION_OPENAI_API_KEY=...` in `~/.bashrc` / `~/.zshrc` / PowerShell
> profile) rather than pasting it into JSON configs, so it is not committed or
> shared.

**A3. After install:** tell the user to **restart their agent session** so the
MCP server loads and this skill is active. Then proceed to **B**.

---

## B. Use — route an image through `analyze_image`

### Decision tree — how to get the image

Check in this order:

1. **A real image path exists** — the user gave you a file path, or a path is
   available in the conversation/workspace (e.g. `C:\shots\bug.png`,
   `./screenshots/ui.png`).
   → Call `analyze_image(image="<path>", ...)` directly. **No user action needed.**

2. **The user pasted an image into the chat** — it's captured in the agent's
   transcript/session. Use auto-discovery:
   - `image="recent"` → analyze the most recently pasted image.
   - `image="session"` → list/analyze images pasted in this session.
   → The tool scans Codex attachments, Grok session images, and Claude
   transcripts automatically. No clipboard dependency.

3. **The image is on the system clipboard** — a screenshot was just taken, or the
   user copied an image (Ctrl+C). This is a fast path for "look at my screen".
   → Call `analyze_image(image="clipboard", ...)`.

4. **The user pasted an image and you got `[Unsupported Image]`** — you have the
   placeholder but no path. Use `image="recent"` to find it, or ask the user to
   save it to a file / copy to clipboard.

### Calling the tool

```
analyze_image(
  image   = "<path | URL | clipboard | data URI>",
  task    = "describe" | "ocr" | "ui" | "layout" | "qa",   // or
  prompt  = "<your specific question>",                     // free-form overrides task
  detail  = "high" (default) | "low",
  save_to = "<optional file path for long output>"
)
```

**Choosing `task` vs `prompt`:**
- `describe` — exhaustive description (everything, verbatim text, layout, colors, anomalies). Use for "what's in this image".
- `ocr` — extract all text verbatim. Use for "read the text / transcribe".
- `ui` — functional UI spec (components, labels, states, layout). Use for app/site screenshots.
- `layout` — spatial structure, alignment, z-order.
- `qa` — answer a specific question grounded in the image; pair with `prompt`.

**Long outputs:** if the description may be long (detailed screenshots, big
diagrams), set `save_to` to a file path so the full text is written out and you
get a path + summary instead of a huge blob in context.

### User-facing flow (mixed scenarios)

| User intent | What you do |
|---|---|
| "看看这个截图 / 分析这个报错" | If path given → analyze it. If not, ask them to save it or copy to clipboard, then `analyze_image`. |
| "这个 UI 怎么样 / 描述下这个页面" | `analyze_image(task="ui")`. |
| "把这段文字提取出来 / OCR" | `analyze_image(task="ocr")`. |
| "这张图里是什么？" | `analyze_image(task="describe")` or `qa` with a `prompt`. |
| Pasted image shows `[Unsupported Image]` | Guide the user (message above), get a path or clipboard, then analyze. |
| "帮我看下我屏幕" / "当前窗口" | Tell user to screenshot + copy to clipboard, then `analyze_image(image="clipboard")`. |

## Important rules

- **Never pretend to see the image.** If you have no path, no URL, and the
  clipboard is empty, you genuinely cannot see it — ask the user, don't fabricate.
- **Never skip the tool.** Even if you think you understand from context, the
  image content is the source of truth. Always route it through `analyze_image`
  when the user wants you to look at something visual.
- **Errors are actionable.** If `analyze_image` returns an error (file not found,
  unsupported format, provider timeout), read it and respond accordingly — e.g.
  ask for the correct path, or note that the vision endpoint timed out.
- **Privacy.** The image goes to the configured vision provider (e.g. mimo v2.5).
  Only analyze images the user intends to share.
