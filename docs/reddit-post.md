# Reddit post draft — r/ClaudeAI / r/LLMDevs / r/opencode

> Pick the title that fits the sub you're posting to. r/opencode → option C.
> Check each sub's self-promo rules before posting; if you're below karma
> threshold, comment on others' posts for a few days first.

## Title options

- **A (r/ClaudeAI, pain-point hook):** DeepSeek / Qwen / Kimi can't see my
  screenshots — so I built an MCP server that gives any text-only coding agent
  vision
- **B (r/LLMDevs, technical):** One MCP server to give any text-only agent
  vision — paste or drag images, auto-discovers them across Claude Code /
  Codex / opencode / Cowork / Grok, multi-image in one call
- **C (r/opencode):** opencode can't see pasted images — `mcp-vision-bridge`
  routes them to a vision model with `image="recent"`

## Body (use for any of the above)

I kept running into this wall: DeepSeek writes great code, but the moment I
paste a screenshot of an error dialog or a broken UI, it says "I can't see
images" and I have to transcribe the error by hand.

So I built a tiny MCP server — one `analyze_image` tool — that forwards image
bytes to any multimodal model you already pay for (mimo, Claude, Gemini,
GPT-4o, Qwen-VL) and returns a text description the agent can reason over.
No images ever enter the agent's context.

What I focused on:

- **Works across every agent** — Claude Code, Codex, opencode, Kimi, PI,
  Cursor. One stdio server, any MCP client. No hosting.
- **Just drag the file in.** Dragging an image into the chat produces a real
  path that `analyze_image` reads directly. No clipboard, no paste quirks.
- **Auto-discovery.** `image="recent"` / `image="session"` find pasted images
  across Claude Code, Codex, opencode, Cowork, Reasonix, and Grok — you never
  type a path. Multi-image in one call, current-session only.
- **Zero config.** `npx -y mcp-vision-bridge` + 3 env vars. Skill + hook
  auto-sync into `~/.claude/` on every start.

Honest note: `task="ocr"` is just a prompt to your vision model — there's no
bundled OCR engine, the model does the reading.

npm: `mcp-vision-bridge` · repo:
[github.com/KuaaMU/mcp-vision-bridge](https://github.com/KuaaMU/mcp-vision-bridge)
(MIT, self-hosted, keys stay on your machine.)

Happy to answer questions about the discovery layer — that was the fiddly
part (each agent stores pasted images differently: image-cache dirs, SQLite
part tables, uploads folders, attachments…).

---

*If posting to multiple subs, change the title slightly each time so it
doesn't look like spam.*
