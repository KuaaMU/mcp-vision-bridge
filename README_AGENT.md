# README_AGENT — for coding agents

This file is for **the agent**, not the human. If you (an LLM agent) are running
with `mcp-vision-bridge` connected, this is your operating manual for the vision
capability.

## The one tool

```
analyze_image(
  image   = "<path | URL | clipboard | recent | session | data:URI>",   // required
  prompt  = "What error is on screen?",              // free-form question
  task    = "describe | ocr | ui | layout | qa",     // preset (ignored if prompt set)
  detail  = "high" | "low",                          // default high
  save_to = "<optional file>"                        // write long output to a file
)
```

Returns **plain text only**. No JSON envelope, no image data — just a detailed,
standalone description you can reason over, quote, or act on.

## When to call it

Call `analyze_image` whenever the user wants you to **see** something visual:
a screenshot, an error dialog, a UI, a diagram, a photo, a chart, pasted image
content, or a screen region. You cannot see images yourself, so this tool is the
only way to look.

## How to choose the `image` source

| Situation | Use |
|---|---|
| User gave a file path, or one exists in the workspace/prompt | **`image="<path>"` — best, works everywhere.** Use this whenever a path is available. |
| User dragged an image file into the chat | The drag inserts a real path in the prompt. Use it directly: `image="<that path>"`. |
| User pasted an image (Claude Code CLI / Reasonix / Cowork / Codex / Grok) | `image="recent"` — auto-finds the most recent pasted image across agents |
| User pasted several images in this session | `image="session"` — list/analyze images pasted in the current session |

**`recent`/`session` scans these on-disk locations automatically** (no clipboard):

| Agent | Location |
|---|---|
| Claude Code CLI/TUI | `~/.claude/image-cache/<uuid>/N.png` (paste with **Alt+V**) |
| Reasonix | `~/.reasonix/sessions/` + project `.reasonix/attachments/` |
| opencode | `~/.local/share/opencode/opencode.db` (SQLite `part` table) |
| Cowork (Claude-3p desktop) | `%LOCALAPPDATA%\Claude-3p\...\uploads\*_image.png` |
| Codex | `~/.codex/attachments/<session>/image-*.png` |
| Grok Build | `~/.grok/sessions/*/*/images/` |

| User just took a screenshot / copied an image to clipboard | `image="clipboard"` — reads the OS clipboard |
| User pasted an image and you got `[Unsupported Image]` / nothing | **The desktop-GUI paste may have failed silently.** Ask the user to **drag the image file into the chat** (inserts a path) or paste a path, then use it |
| User gave a URL | `image="https://…"` |

**Key rule:** a real file path is the most reliable source — it works in every
agent's TUI and GUI. Prefer asking for a path or a dragged-in file over relying
on clipboard or paste attachment, which some desktop GUIs drop silently.

## Choosing `task` vs `prompt`

**Always pass the user's actual question as `prompt` when you know it.** The
vision model answers what you ask — a specific question ("what error is shown",
"is the button disabled") beats a generic describe. This is the **focus-hint**
principle: the model targets the question, not a broad description. When using
`image="recent"` / `"session"`, carry the user's question into `prompt` too.

- `task="describe"` — exhaustive description: every element, verbatim text, layout, colors, anomalies.
- `task="ocr"` — extract all visible text verbatim, in reading order.
- `task="ui"` — functional UI spec: components, labels, states, positions, behavior clues.
- `task="layout"` — spatial structure, alignment, z-order.
- `task="qa"` — answer a specific question; pair with `prompt`.
- Provide a free-form `prompt` for anything else — it overrides `task`.

## Handling the response

- **Long descriptions**: if the output is large, use `save_to` so the full text
  is written to a file and you get a path + summary instead of a huge blob in
  context.
- **The description is the ground truth** — quote it, reason over it, and act.
  Don't re-ask for the image unless you need a different detail.

## Handling errors

The tool returns `isError: true` with a plain-text `Error:` message when it fails.
Interpret and respond:

| Error hints | What to do |
|---|---|
| `Could not read image file` | The path is wrong/missing — ask for the correct path. |
| `does not contain a supported image` | Not a PNG/JPEG/WEBP/GIF — ask for a valid image. |
| `No image was found on the clipboard` | Clipboard isn't an image — try `image="recent"`, or ask the user to give a path. |
| `timed out after …ms` | The vision endpoint is slow/down — retry once, or tell the user. |
| `HTTP 401/403` | Bad API key — tell the user to check `VISION_OPENAI_API_KEY`. |
| `Unknown task "…"` | Use one of `describe/ocr/ui/layout/qa`, or a free-form prompt. |

## The auto-loop hook (Claude Code)

When the user pastes an image (or drags a file in), a `UserPromptSubmit` hook
reads the session transcript, captures every newly-pasted image to a file, and
injects context like:

```
[vision-bridge] The user pasted 3 image(s). They have been captured and saved to these files:
  <path-1>
  <path-2>
  <path-3>
```

If you see that, call `analyze_image` with the paths (or `image="recent"` for
the most recent). If you (the model) can already see images directly, ignore the
hint and analyze natively. In Cowork and Codex, pasted images are saved to files
automatically — the same `image="recent"`/`"session"` discovery finds them.

## Environment variables (how the server is configured)

The MCP reads these from its env when it starts (set in your agent's MCP config):

| Var | Purpose |
|---|---|
| `VISION_PROVIDER` | `openai` (default) \| `anthropic` \| `gemini` |
| `VISION_MODEL` | vision model id (e.g. `mimo-v2.5`) |
| `VISION_OPENAI_BASE_URL` | OpenAI-compatible endpoint |
| `VISION_OPENAI_API_KEY` | key for that endpoint |
| `VISION_ANTHROPIC_API_KEY` / `VISION_GEMINI_API_KEY` | keys for those providers |
| `VISION_MAX_TOKENS` | output cap (default 2048) |
| `VISION_TIMEOUT_MS` | fetch/provider timeout (default 90000) |

## Uninstall / disable

- **Plugin install**: `claude plugin uninstall mcp-vision-bridge`
- **install.sh install**: remove the `vision` entry from `~/.claude.json`
  `mcpServers`, delete `~/.claude/skills/vision`, and remove the
  `vision-clipboard` hook from `~/.claude/settings.json`.
