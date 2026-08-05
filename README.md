<div align="center">

# 👁️ llm-vision-mcp

**Give your text-only coding agent eyes.**

DeepSeek V4 Flash can write beautiful code — but it can't *see* the error dialog, the broken UI, or the traceback screenshot you just pasted.

`llm-vision-mcp` fixes that. It's a one-tool [MCP](https://modelcontextprotocol.io) server that turns **any image** into a **detailed, standalone text description** your text-only LLM can reason over — powered by the multimodal model of *your* choice.

Works with **Claude Code · opencode · Codex · Kimi Code · PI · Cursor** and any MCP client.

<br>

`npx -y mcp-vision-bridge` → 60 seconds to working vision.

</div>

---

## Why you need this

**DeepSeek V4 Flash (0731)** is topping every coding benchmark — and it has **no eyes**. Neither does the upcoming **DeepSeek V4 Pro**. The same goes for most open-weight coding models.

You paste a screenshot. The agent says *"I can't see images."* You transcribe the error by hand. Ugh.

With `llm-vision-mcp` the agent just calls one tool:

> `analyze_image(image="./screenshot.png", prompt="What error is on screen?")`
>
> → *"❌ `ModuleNotFoundError: No module named 'cannx'` — appears in terminal output on line 3 of the traceback…"*

The image never reaches the agent. A complete text description does. The agent can now debug, fix, and explain — eyes closed, context open.

> **Is it a vision model?** No — and that's the point. The MCP routes pixels to whatever multimodal model you already pay for (mimo, Claude, Gemini, GPT-4o, Qwen-VL…) and engineers the prompt so the description is exhaustive enough to stand alone.

---

## Features

- **One tool, every image source** — local path, http(s) URL, base64 `data:` URI, the system **clipboard**, or raw bytes. No image server, no upload, no setup.
- **Bring your own vision model** — OpenAI-compatible (OpenRouter, DeepSeek/Volcengine/OpenCode gateways, local emulators), Anthropic, Google Gemini. Swap by changing one env var.
- **Exhaustive by default** — a "max-descriptive" system prompt makes the vision model enumerate every element, quote text *verbatim*, and flag anything anomalous. Pure-text agents get everything they need in one call.
- **5 task presets** — `describe` · `ocr` · `ui` · `layout` · `qa`, or ask anything with a free-form `prompt`.
- **Context-friendly** — `save_to` writes long descriptions to a file and returns a path + summary, so your agent's context window stays small.
- **Cached & safe** — in-memory + optional disk cache; optional SSRF guard for URL sources; API keys live in env, never in tool args.

---

## Quick start (60 seconds)

### 1. Install

```bash
npm install -g mcp-vision-bridge      # global install
npx -y mcp-vision-bridge              # or run without installing
```

Requires **Node.js ≥ 18**.

### 2. Point it at your vision model

Everything is configured by **environment variables** — the MCP reads them from the agent's server config, so you only ever set them once. Keys never appear in tool arguments.

**OpenAI-compatible** — the most common gateway format (OpenRouter · OpenCode GO · DeepSeek/Volcengine gateways · local emulators). **You must set your own endpoint, key, and model** — nothing here works without them:

| Variable | Purpose |
|---|---|
| `VISION_OPENAI_BASE_URL` | Your endpoint, e.g. `https://opencode.ai/zen/go/v1` or `https://api.openai.com/v1` |
| `VISION_OPENAI_API_KEY` | Your API key |
| `VISION_MODEL` | e.g. `mimo-v2.5`, `gpt-4o`, `qwen-vl-max` |

**Anthropic** (`VISION_PROVIDER=anthropic`): `VISION_ANTHROPIC_API_KEY` + `VISION_MODEL=claude-sonnet-4-5`
**Gemini** (`VISION_PROVIDER=gemini`): `VISION_GEMINI_API_KEY` + `VISION_MODEL=gemini-2.0-flash`

Full variable table [below](#configuration-reference).

### 3. Register with your agent

Pick your platform. The agent immediately gains `analyze_image`.

> In every config below, replace **`https://your-gateway/v1`**, **`sk-your-key`**, and **`your-vision-model`** with your own endpoint, key, and model. There is no built-in default.

<details>
<summary><b>Claude Code — GUI (cc-switch) · TUI · or <code>.mcp.json</code></b></summary>

**Option A — cc-switch (GUI, recommended for most users):**

1. Open **cc-switch** → click **「MCP」** in the top nav → **「+」**
2. Fill in (transport `stdio`):
   | Field | Value |
   |---|---|
   | Server ID | `vision` |
   | Transport | `stdio` |
   | Command | `npx` |
   | Args | `["-y", "mcp-vision-bridge"]` |
   | Env | see below |
3. Save, then toggle **「Claude」** on (writes to `~/.claude.json`)
4. Restart Claude Code

```json
{
  "VISION_PROVIDER": "openai",
  "VISION_OPENAI_BASE_URL": "https://your-gateway/v1",
  "VISION_OPENAI_API_KEY": "sk-your-key",
  "VISION_MODEL": "your-vision-model"
}
```

**Option B — Claude Code TUI (`claude mcp add`):**

```bash
claude mcp add vision -- \
  npx -y mcp-vision-bridge \
  -e VISION_OPENAI_BASE_URL=https://your-gateway/v1 \
  -e VISION_OPENAI_API_KEY=sk-your-key \
  -e VISION_MODEL=your-vision-model
```

**Option C — project `.mcp.json`:**

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "mcp-vision-bridge"],
      "env": {
        "VISION_OPENAI_BASE_URL": "https://your-gateway/v1",
        "VISION_OPENAI_API_KEY": "sk-your-key",
        "VISION_MODEL": "your-vision-model"
      }
    }
  }
}
```
</details>

<details>
<summary><b>opencode</b> — <code>opencode.json</code></summary>

```json
{
  "mcp": {
    "vision": {
      "type": "local",
      "command": ["npx", "-y", "mcp-vision-bridge"],
      "environment": {
        "VISION_OPENAI_BASE_URL": "https://your-gateway/v1",
        "VISION_OPENAI_API_KEY": "sk-your-key",
        "VISION_MODEL": "your-vision-model"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Codex</b> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.vision]
command = "npx"
args = ["-y", "mcp-vision-bridge"]
env = { VISION_OPENAI_BASE_URL = "https://your-gateway/v1", VISION_OPENAI_API_KEY = "sk-your-key", VISION_MODEL = "your-vision-model" }
```
</details>

<details>
<summary><b>Kimi Code</b> — <code>.mcp.json</code></summary>

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "mcp-vision-bridge"],
      "env": {
        "VISION_OPENAI_BASE_URL": "https://your-gateway/v1",
        "VISION_OPENAI_API_KEY": "sk-your-key",
        "VISION_MODEL": "your-vision-model"
      }
    }
  }
}
```
</details>

<details>
<summary><b>PI (Pear AI / Codespaces)</b> — MCP config</summary>

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "mcp-vision-bridge"],
      "env": {
        "VISION_OPENAI_BASE_URL": "https://your-gateway/v1",
        "VISION_OPENAI_API_KEY": "sk-your-key",
        "VISION_MODEL": "your-vision-model"
      }
    }
  }
}
```
</details>

Any other MCP client: register a stdio server running `npx -y mcp-vision-bridge`.

---

## What the agent sees

One tool, with a clear contract the agent can discover:

```
analyze_image(
  image     string   // path | URL | data: URI | "clipboard" | "raw"
  prompt?   string   // "What error is on screen?"
  task?     describe | ocr | ui | layout | qa
  detail?   low | high            // default high
  save_to?  string                // write full text to a file
)
```

**Every `image` source, zero friction:**
- **Local path** — `./screenshots/bug.png`, `C:\shots\ui.png`
- **http(s) URL** — `https://example.com/diagram.png`, `http://localhost:5173/snap.png`
- **data URI** — `data:image/png;base64,iVBOR...`
- **`"clipboard"`** — analyze whatever screenshot you just copied. That's it.
- **`"raw"`** — the string *is* the image bytes.

The response is **plain text**, engineered to be exhaustive: every element, all text *verbatim*, spatial layout, colors, states, anomalies — and an explicit *"I can't read this part"* when it can't. Your text-only agent acts on it like it saw the image.

---

## Real results (example: mimo-v2.5)

`llm-vision-mcp` + `mimo-v2.5` in action — shown here as an example model.
Yours may differ; the same `analyze_image` tool works with any vision model.
One `describe` / `ocr` call each.

### 1 · Terminal / error analysis → `describe`

> **Input:** a Windows PowerShell prompt with a compile error highlighted.
> **Output:**
> ```
> The image is a Windows PowerShell terminal. The prompt shows:
>   PS C:\Users\dev> cargo build
>   error[E0277]: the trait bound `Foo: Bar` is not satisfied
>   ...
> ```

### 2 · Screenshot OCR → `ocr`

> **Input:** a full-screen Notepad screenshot (Chinese CV text, menus, title bar).
> **Output:** every line reproduced **verbatim**, including the menu bar
> `文件(F) 编辑(E) 格式(O) 查看(V) 帮助(H)` and the entire body text, in reading order.

### 3 · Character / asset analysis → `describe`

> **Input:** a cartoon character with a raised glass.
> **Output:** full breakdown — white fur, black outlines, red collar with gold tag,
> champagne flute with bubbles, and the tiny watermark `萌图屋 · qq.335395.com` read out.

### 4 · Document/photo understanding → `describe`

> **Input:** a photo of an ID card on striped fabric.
> **Output:** card type, national emblem, Chinese text, issuing authority and
> validity dates read exactly, plus a note on the glare partially obscuring the design.

All four ran through the **same `analyze_image` tool**, same system prompt, zero prompt-tuning. Try it on your own screenshots — the clipboard source makes it a one-word ask: *"analyze clipboard"*.

---

## Configuration reference

| Variable | Required | Purpose |
|---|---|---|
| `VISION_PROVIDER` | optional | `openai` \| `anthropic` \| `gemini` |
| `VISION_MODEL` | **yes** | Vision model id — e.g. `mimo-v2.5`, `gpt-4o`, `qwen-vl-max`, `gemini-2.0-flash` |
| `VISION_OPENAI_BASE_URL` | **yes** | Your OpenAI-compatible endpoint (OpenRouter / OpenCode GO / gateway / local) |
| `VISION_OPENAI_API_KEY` | **yes*** | Key for that endpoint |
| `VISION_ANTHROPIC_BASE_URL` | **yes*** | Anthropic base |
| `VISION_ANTHROPIC_API_KEY` | **yes*** | Anthropic key |
| `VISION_GEMINI_BASE_URL` | **yes*** | Gemini base |
| `VISION_GEMINI_API_KEY` | **yes*** | Google AI Studio key |
| `VISION_MAX_TOKENS` | optional | `2048` — Vision output cap (complex screenshots → 3000+) |
| `VISION_TIMEOUT_MS` | optional | `30000` — Fetch + provider timeout |
| `VISION_CACHE_DIR` | optional | (memory only) — On-disk image cache dir |
| `VISION_BLOCK_PRIVATE_URLS` | optional | `false` — `true` blocks localhost/private URL fetches |

\* Required only when that provider is selected. **Always set your own endpoint, key, and model** — there are no working defaults.

\* Required only when that provider is selected.

---

## How it works

```
text-only agent ──▶ analyze_image ──▶ [resolve image bytes] ──▶ [vision model]
   (DeepSeek V4,                                                    (mimo / Claude /
    Qwen, Kimi …)                                                     Gemini / GPT-4o)
        ◀────────────── exhaustive text description ◀──────────────
```

The server **never sees** what the image means — it resolves the source, sends
pixels to your vision model, and returns the text. Pure text in, pure text out.
No images in your agent's context window.

---

## Development

```bash
npm install
npm run build          # tsc → dist/
npm test               # 55 unit + integration tests (vitest)
npm run test:e2e       # full stdio pipeline against a mock provider
```

### Project layout

```
src/
  config.ts            # env-based configuration
  errors.ts            # typed error hierarchy
  image/
    resolver.ts        # source → bytes (path/url/data/clipboard/raw)
    mime.ts            # magic-byte detection
    clipboard.ts       # OS clipboard image reading
    cache.ts           # in-memory LRU + on-disk sidecar
  prompt/
    presets.ts         # max-descriptive system prompt + task presets
  providers/
    base.ts            # VisionProvider interface
    openai.ts          # OpenAI-compatible adapter
    anthropic.ts       # Anthropic Messages API adapter
    gemini.ts          # Gemini generateContent adapter
    factory.ts         # provider selection from config
  tool/
    analyze-image.ts   # the analyze_image handler
  output.ts            # save_to sidecar writer
  index.ts             # McpServer wiring + stdio transport
scripts/
  e2e-smoke.mjs        # end-to-end smoke test
  live-smoke.mjs       # real-endpoint smoke (env-driven key, never committed)
```

---

## Security

- **Keys live in env only.** Provider API keys are never accepted as tool
  arguments, so they can't be exfiltrated via prompt injection.
- **SSRF guard** — `VISION_BLOCK_PRIVATE_URLS=true` blocks localhost/private fetches.
- **Local-first** — the server reads only the files you point at it.

## License

[MIT](LICENSE)

---

<div align="center">

**DeepSeek writes the code. `llm-vision-mcp` reads the screen.**

[GitHub](https://github.com/KuaaMU/mcp-vision-bridge) · [Issues](https://github.com/KuaaMU/mcp-vision-bridge/issues) · ⭐ Star it if it's useful

</div>
