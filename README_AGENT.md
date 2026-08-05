# README_AGENT — for coding agents

This file is for **the agent**, not the human. If you (an LLM agent) are running
with `mcp-vision-bridge` connected, this is your operating manual for the vision
capability.

## The one tool

```
analyze_image(
  image   = "<path | URL | clipboard | data:URI>",   // required
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
| User gave a file path (or one exists in the workspace) | `image="<path>"` — no user action needed |
| User just took a screenshot / copied an image | `image="clipboard"` — reads the OS clipboard |
| User pasted an image and you got `[Unsupported Image]` | **No usable data.** Ask the user to save it to a file and give the path, OR copy it to the clipboard, then call the tool |
| User gave a URL | `image="https://…"` |

## Choosing `task` vs `prompt`

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
| `No image was found on the clipboard` | Clipboard isn't an image — ask the user to copy one or give a path. |
| `timed out after …ms` | The vision endpoint is slow/down — retry once, or tell the user. |
| `HTTP 401/403` | Bad API key — tell the user to check `VISION_OPENAI_API_KEY`. |
| `Unknown task "…"` | Use one of `describe/ocr/ui/layout/qa`, or a free-form prompt. |

## The auto-loop hook (Claude Code)

When the user copies an image and their message sounds like "look at this"
(e.g. 看看这个), a `UserPromptSubmit` hook snapshots the clipboard to a file and
injects context like:

```
[vision-bridge] The user copied an image … snapshotted to a file:
  <path>
```

If you see that, call `analyze_image` with the snapshot path. If you (the model)
can already see images directly, ignore the hint and analyze natively.

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
| `VISION_TIMEOUT_MS` | fetch/provider timeout (default 30000) |

## Uninstall / disable

- **Plugin install**: `claude plugin uninstall mcp-vision-bridge`
- **install.sh install**: remove the `vision` entry from `~/.claude.json`
  `mcpServers`, delete `~/.claude/skills/vision`, and remove the
  `vision-clipboard` hook from `~/.claude/settings.json`.
