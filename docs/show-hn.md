# Show HN post — Hacker News

> Post at https://news.ycombinator.com/submit
> Show HN rules: it must be something you made, people can try now, and the
> title should be neutral ("Show HN: ..."). Post once — HN doesn't like
> repeat submissions of the same project.

## Title

```
Show HN: MCP server that gives text-only coding agents (DeepSeek/Qwen/Kimi) vision
```

## URL

```
https://github.com/KuaaMU/mcp-vision-bridge
```

## First comment (this is where the story lives)

I use DeepSeek V4 Flash for coding — it's fast and cheap, but it's pure text.
The moment I paste a screenshot of an error dialog or a broken UI, it says
"I can't see images", and I'm back to transcribing errors by hand.

So I built a small MCP server with one `analyze_image` tool: it forwards
image bytes to any multimodal model you already pay for (mimo, Claude,
Gemini, GPT-4o, Qwen-VL) and returns a text description the agent can reason
over. Images never enter the agent's context — the bridge reads pixels, your
vision model does the seeing.

Design decisions I'm most happy with:

1. **No hosting.** It's a stdio server, `npx -y mcp-vision-bridge`. Runs
   locally; your API keys and images never leave your machine. Works with any
   MCP client — Claude Code, Codex, opencode, Kimi, PI, Cursor.

2. **Drag-drop just works.** Dragging an image file into any chat produces a
   real path, which `analyze_image` reads directly. That sidestepped the whole
   clipboard mess (clipboard only holds the last image; Explorer "copy file"
   puts a file list, not image bytes).

3. **Auto-discovery across agents.** Each agent stores pasted images
   differently — Claude Code has `~/.claude/image-cache/<uuid>/N.png`, Codex
   uses `~/.codex/attachments/`, opencode stores base64 in a SQLite `part`
   table, Cowork writes uploads/, Grok has session images. `image="recent"` /
   `image="session"` scans all of these so you never type a path. Multi-image
   in one call, scoped to the current session only (no cross-session leaks).

4. **Self-updating.** The bundled skill + hook auto-sync into `~/.claude/`
   on every server start, so users of `npx -y` always get the newest version.

Honest caveats: `task="ocr"` is just a prompt to your vision model — there's
no bundled OCR engine. And if you're on a DeepSeek-style model, pick a cheap
vision model (mimo v2.5, qwen-vl-max) or the vision calls cost a bit.

npm: `mcp-vision-bridge` · MIT. Would love feedback on the discovery layer
and anything that feels over-engineered.
