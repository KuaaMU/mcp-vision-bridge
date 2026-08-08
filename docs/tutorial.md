# Give your text-only coding agent eyes — 5-minute setup

DeepSeek V4 Flash writes great code. But it can't *see* the error dialog you
just pasted, the broken UI, or the screenshot of that rendering bug. It replies
"I can't see images." Then you type the error out by hand. Again.

**mcp-vision-bridge** fixes that. It's a tiny MCP server that gives any
text-only coding agent vision by routing images to a multimodal model you
probably already pay for — mimo, Claude, Gemini, GPT-4o, Qwen-VL. One tool:
`analyze_image`.

```text
You (paste a screenshot of an error dialog)
    ↓
Agent (text-only, calls analyze_image)
    ↓
mcp-vision-bridge (forwards the image bytes)
    ↓
Your vision model (mimo / Claude / Gemini / GPT-4o)
    ↓
Agent now reasons over a full text description
```

No images ever enter your agent's context. The bridge reads the pixels, your
vision model does the seeing, and the text comes back.

## What makes it different

There are plenty of "MCP vision" servers. Most expect you to host a server
that talks to it. This one is **local, one command, zero config**:

- **Works across every agent** — Claude Code, Codex, opencode, Kimi, PI,
  Cursor, Reasonix. One server, any MCP client.
- **Paste or drag.** Drag an image file into the chat → a real path lands in
  the prompt → `analyze_image` reads it. No clipboard, no paste quirks.
- **Auto-discovery.** `image="recent"` / `image="session"` find images you
  pasted across Claude Code, Codex, opencode, Cowork, Reasonix, and Grok —
  without you typing a path.
- **Many images in one call.** Paste 3 screenshots, ask one question. The hook
  reads your session transcript and passes them all to the model in a single
  request, each with its own token budget.
- **Current-session only.** `recent`/`session` never leak images from another
  session — privacy and parallel-use safe.
- **Self-updating.** The skill + hook auto-sync into `~/.claude/` on every
  server start, so `npx -y mcp-vision-bridge` always runs the latest.

## Install — pick your agent

**Claude Code (plugin, one command):**

```bash
claude plugin marketplace add KuaaMU/agent-plugins
claude plugin install mcp-vision-bridge
```

**Anything else (Codex, opencode, Kimi, PI…):**

```bash
git clone https://github.com/KuaaMU/mcp-vision-bridge && cd mcp-vision-bridge
./install.sh            # auto-detects your agent
```

**Manual (any MCP client):**

```json
{
  "command": "npx",
  "args": ["-y", "mcp-vision-bridge"],
  "env": {
    "VISION_OPENAI_BASE_URL": "https://your-endpoint/v1",
    "VISION_OPENAI_API_KEY": "sk-your-key",
    "VISION_MODEL": "your-vision-model"
  }
}
```

Requires Node.js ≥ 18.

## Use it

1. **Restart your agent** after install.
2. **Drag an image file into the chat** (or Ctrl+V in Claude Code / Cowork).
3. Say **"看看这个"** / **"analyze this"** / **"what's the error?"**

Your agent calls `analyze_image` and gets back a detailed text description it
can debug against — verbatim text, layout, colors, anomalies.

Pasted several images? The hook detects them in your session transcript and
guides the agent to call `analyze_image(image="session")` — all of them, one
call.

## One tool, honest about what it is

`analyze_image(image, prompt, task, detail, save_to)` accepts a path, URL,
`"clipboard"`, `"recent"`, `"session"`, or an array. `task` presets
(`describe | ocr | ui | layout | qa`) are **prompts sent to your vision model**
— there's no bundled OCR engine; the model does the reading. Pass the user's
actual question as `prompt` and the model answers what you ask.

## What it's not

- Not a vision model — it routes to one you already pay for.
- Not an OCR engine — it asks a multimodal model to read the image.
- Not a cloud service — it runs locally; your keys and images stay on your
  machine.

MIT licensed. npm: `mcp-vision-bridge`. Source:
[github.com/KuaaMU/mcp-vision-bridge](https://github.com/KuaaMU/mcp-vision-bridge)
⭐ If it saves you from transcribing one more error dialog, a star keeps it
maintained.
