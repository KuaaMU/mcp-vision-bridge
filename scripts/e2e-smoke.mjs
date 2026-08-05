/**
 * E2E smoke test: run the real server over stdio and drive it with the MCP
 * SDK client against a local mock OpenAI-compatible endpoint.
 *
 * Requires VISION_MOCK_ENDPOINT to be set by the caller (it points at a mock
 * /v1/chat/completions that echoes a canned description). The mock validates
 * that the request actually contained an image payload.
 *
 * Run:  npm run build && node scripts/e2e-smoke.mjs
 */

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ─── 1. Mock OpenAI-compatible endpoint ────────────────────────────────────
// Responds with a canned description, but asserts the incoming request body
// actually contained an image_url part (so we know the pipeline carried bytes).

let sawImage = false;

const mock = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      /* ignore */
    }
    const content = parsed?.messages?.[1]?.content ?? [];
    sawImage = Array.isArray(content) && content.some((p) => p?.type === "image_url");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "chatcmpl-e2e",
        model: parsed?.model ?? "mock-model",
        choices: [{ index: 0, message: { role: "assistant", content: "E2E: I see a red circle with the text 'HELLO'." }, finish_reason: "stop" }],
      }),
    );
  });
});

const PORT = 48711;

// ─── 2. Spin up the real server over stdio ─────────────────────────────────

async function run() {
  await new Promise((resolve) => mock.listen(PORT, resolve));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist", "index.js")],
    cwd: root,
    env: {
      ...process.env,
      VISION_PROVIDER: "openai",
      VISION_OPENAI_BASE_URL: `http://127.0.0.1:${PORT}/v1`,
      VISION_OPENAI_API_KEY: "sk-mock",
      VISION_MODEL: "mock-vision",
    },
  });

  const client = new Client({ name: "e2e", version: "0.0.1" });
  await client.connect(transport);

  // List tools.
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  if (!names.includes("analyze_image")) {
    throw new Error(`analyze_image not exposed. Got: ${names.join(", ")}`);
  }
  console.log("✓ tools exposed:", names.join(", "));

  // Call analyze_image against a tiny local PNG fixture.
  const fixture = join(root, "scripts", "fixture-1x1.png");
  const result = await client.callTool({
    name: "analyze_image",
    arguments: { image: fixture, task: "describe" },
  });

  const text = result.content?.map((c) => (c.type === "text" ? c.text : "")).join("\n") ?? "";
  if (!text.includes("E2E: I see a red circle")) {
    throw new Error(`Unexpected tool output: ${text.slice(0, 300)}`);
  }
  console.log("✓ analyze_image returned mock description");

  if (!sawImage) {
    throw new Error("The mock endpoint did not receive an image payload.");
  }
  console.log("✓ mock endpoint received an image_url payload (bytes carried end-to-end)");

  await client.close();
  mock.close();
  console.log("PASS");
}

run().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
