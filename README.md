# llm-vision-mcp

**Vision for text-only LLM coding agents.**

`llm-vision-mcp` is a Model Context Protocol (MCP) server that gives pure-text
large language models (DeepSeek, Qwen, Kimi, and any other text-only agent)
the ability to **see** — by routing images to a multimodal model of your choice
and returning a detailed, standalone text description the agent can reason over.

The server itself is **not** a vision model. It resolves image sources, sends
the pixels to a vision model (mimo, Claude, Gemini, or any OpenAI-compatible
endpoint), and engineers the prompt so the returned text is exhaustive enough
for a text-only agent to act on without ever seeing the image.

> Why: DeepSeek V4 Flash and friends are superb at coding but have no eyes.
> Point them at this MCP and they can read error dialogs, inspect UI
> screenshots, OCR terminals, and understand diagrams.

---

## Features

- **One tool, all sources** — `analyze_image` accepts a local file path, http(s)
  URL, base64 data URI, the system **clipboard**, or raw bytes.
- **Provider-agnostic** — adapters for OpenAI-compatible (OpenRouter, Chinese
  gateways, opencode GO / mimo, local emulators), Anthropic, and Google Gemini.
- **Exhaustive by default** — a "max-descriptive" system prompt pushes the
  vision model to return complete, verbatim, standalone text.
- **Task presets** — `describe` | `ocr` | `ui` | `layout` | `qa`, or pass a
  free-form `prompt`.
- **Context-friendly** — `save_to` writes long descriptions to a file and
  returns a path + summary instead of a giant blob.
- **Cached** — in-memory LRU + optional on-disk sidecar so re-analysis doesn't
  re-download.
- **SSRF guard** — optional private-address blocking for URL sources.
- **Works with any MCP client** — Claude Code, PI, Codex, Kimi Code, opencode,
  Cursor, and more.

---

## Quick start

### 1. Install

```bash
npm install -g llm-vision-mcp
# or run directly without installing:
# npx -y llm-vision-mcp
```

Requires Node.js ≥ 18.

### 2. Configure a provider

All configuration is via **environment variables**. Keys never appear in tool
arguments, so a prompt-injected agent cannot read them.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VISION_PROVIDER` | no | `openai` | `openai` \| `anthropic` \| `gemini` |
| `VISION_MODEL` | no | `mimo-v2.5` | Model id passed to the provider |
| `VISION_OPENAI_API_KEY` | yes* | — | Key for the OpenAI-compatible endpoint |
| `VISION_OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | Base URL (OpenRouter / gateway / opencode GO) |
| `VISION_ANTHROPIC_API_KEY` | yes* | — | Anthropic key |
| `VISION_ANTHROPIC_BASE_URL` | no | `https://api.anthropic.com` | Anthropic base |
| `VISION_GEMINI_API_KEY` | yes* | — | Google AI Studio key |
| `VISION_GEMINI_BASE_URL` | no | `https://generativelanguage.googleapis.com` | Gemini base |
| `VISION_MAX_TOKENS` | no | `2048` | Vision model output cap |
| `VISION_TIMEOUT_MS` | no | `60000` | Fetch + provider timeout |
| `VISION_CACHE_DIR` | no | (memory only) | On-disk image cache dir |
| `VISION_BLOCK_PRIVATE_URLS` | no | `false` | `true` blocks localhost/private URL fetches |

\* Required only when that provider is selected.

### 3. Register the server

<details>
<summary><b>Claude Code</b> — add to <code>.mcp.json</code> or run
<code>claude mcp add</code></summary>

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "llm-vision-mcp"],
      "env": {
        "VISION_PROVIDER": "openai",
        "VISION_OPENAI_BASE_URL": "https://api.openai.com/v1",
        "VISION_OPENAI_API_KEY": "sk-...",
        "VISION_MODEL": "gpt-4o"
      }
    }
  }
}
```

Or the CLI: `claude mcp add vision -- npx -y llm-vision-mcp`
</details>

<details>
<summary><b>opencode</b> — add to <code>opencode.json</code></summary>

```json
{
  "mcp": {
    "vision": {
      "type": "local",
      "command": ["npx", "-y", "llm-vision-mcp"],
      "environment": {
        "VISION_PROVIDER": "openai",
        "VISION_OPENAI_BASE_URL": "https://api.openai.com/v1",
        "VISION_OPENAI_API_KEY": "sk-...",
        "VISION_MODEL": "gpt-4o"
      }
    }
  }
}
```

> Using opencode GO with mimo v2.5? Point `VISION_OPENAI_BASE_URL` at your GO
> gateway and set `VISION_MODEL=mimo-v2.5`.
</details>

<details>
<summary><b>Codex</b> — <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.vision]
command = "npx"
args = ["-y", "llm-vision-mcp"]
env = { VISION_PROVIDER = "openai", VISION_OPENAI_API_KEY = "sk-...", VISION_MODEL = "gpt-4o" }
```
</details>

<details>
<summary><b>Kimi Code</b> — <code>.mcp.json</code></summary>

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "llm-vision-mcp"],
      "env": {
        "VISION_PROVIDER": "openai",
        "VISION_OPENAI_API_KEY": "sk-...",
        "VISION_MODEL": "gpt-4o"
      }
    }
  }
}
```
</details>

<details>
<summary><b>PI (Pear AI / Codespaces)</b> — MCP config</summary>

Add the server to your PI agent's MCP configuration, e.g.:

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "llm-vision-mcp"],
      "env": { "VISION_OPENAI_API_KEY": "sk-...", "VISION_MODEL": "gpt-4o" }
    }
  }
}
```
</details>

Any other MCP client works the same way: register a stdio server running
`npx -y llm-vision-mcp`.

---

## Usage

Once registered, the agent sees one tool:

### `analyze_image`

```jsonc
{
  "image": "clipboard",                 // path | URL | data: URI | "clipboard" | "raw"
  "prompt": "What error is on screen?",  // optional free-form question
  "task": "describe",                    // optional: describe|ocr|ui|layout|qa
  "detail": "high",                      // optional: low|high (default high)
  "save_to": "out/analysis.md"           // optional: write full text to file
}
```

- `image` — one of:
  - a **local path** (`./screenshots/bug.png`, `C:\shots\ui.png`)
  - an **http(s) URL** (`https://example.com/diagram.png`, `http://localhost:5173/snap.png`)
  - a **base64 data URI** (`data:image/png;base64,iVBOR...`)
  - the literal **`"clipboard"`** → reads the image currently copied to the system clipboard
  - the literal **`"raw"`** → the string itself is raw image bytes (base64 or binary string)
- `prompt` — your question; overrides `task`.
- `task` — quick presets that fill in a detailed instruction:
  - `describe` — complete, exhaustive description
  - `ocr` — extract all text verbatim
  - `ui` — functional UI spec (components, labels, states, layout)
  - `layout` — spatial structure, alignment, z-order
  - `qa` — answer your `prompt` grounded in the image
- `detail` — `high` (default) for maximum completeness, `low` to cap output
- `save_to` — write the full description to a file and return a path + 2000-char
  summary. Use this for long outputs so the agent's context stays small.

The response is **plain text** — a detailed, standalone description. The vision
model is instructed to enumerate every element, quote all visible text verbatim,
report layout/colors/states, and flag anything anomalous.

---

## Provider examples

### OpenAI-compatible (default) — OpenRouter / gateway / opencode GO

```bash
export VISION_PROVIDER=openai
export VISION_OPENAI_BASE_URL=https://openrouter.ai/api/v1   # or your gateway
export VISION_OPENAI_API_KEY=sk-or-...
export VISION_MODEL=openai/gpt-4o                             # or mimo-v2.5
```

### Anthropic

```bash
export VISION_PROVIDER=anthropic
export VISION_ANTHROPIC_API_KEY=sk-ant-...
export VISION_MODEL=claude-sonnet-4-5
```

### Google Gemini

```bash
export VISION_PROVIDER=gemini
export VISION_GEMINI_API_KEY=AIza...
export VISION_MODEL=gemini-2.0-flash
```

---

## Development

```bash
npm install
npm run build          # tsc → dist/
npm test               # unit + integration (vitest)
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
```

---

## Security notes

- **Keys live in env only.** Provider API keys are never accepted as tool
  arguments, so they cannot be exfiltrated via prompt injection.
- **SSRF guard** — set `VISION_BLOCK_PRIVATE_URLS=true` to prevent URL-based
  fetches to localhost/private ranges.
- **Local-first** — the server reads only the files you point it at and sends
  image bytes to your configured provider.

## License

[MIT](LICENSE)
