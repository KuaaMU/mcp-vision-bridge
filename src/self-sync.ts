/**
 * Self-sync skill + hook on MCP startup.
 *
 * `npx -y mcp-vision-bridge` pulls the latest npm package on every launch, so
 * the MCP server is always the newest code — but the vision skill and the
 * auto-loop hook are loaded by Claude Code from the USER directory
 * (`~/.claude/skills/` and `~/.claude/hooks/`), not from node_modules. So a
 * user who updates the npm package gets the new MCP server but a stale skill /
 * hook. This module fixes that: on startup, copy the bundled skill + hook into
 * the user directory (idempotent — only writes when content differs), and
 * ensure settings.json registers the hook.
 *
 * Cross-platform: home via USERPROFILE/HOME/os.homedir, path.join for
 * separators, fileURLToPath for Windows drive letters, chmod only on POSIX.
 * Silent: every step is guarded; a failure never prevents the MCP server from
 * starting. Set VISION_NO_SYNC=1 to disable.
 */
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Home directory (USERPROFILE on Windows, HOME elsewhere). */
function homeDir(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
}

/** Package root: dist/index.js is at <root>/dist/index.js. */
function packageRoot(): string {
  const here = fileURLToPath(import.meta.url); // .../mcp-vision-bridge/dist/self-sync.js
  return path.resolve(path.dirname(here), "..");
}

/** Sync a file only when its content differs (idempotent, avoids write churn). */
async function syncFile(src: string, dest: string): Promise<boolean> {
  try {
    const [srcBuf, destBuf] = await Promise.all([
      fs.readFile(src),
      fs.readFile(dest).catch(() => null),
    ]);
    if (destBuf && destBuf.equals(srcBuf)) return false;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, srcBuf);
    if (process.platform !== "win32") {
      await fs.chmod(dest, 0o755).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/** Ensure settings.json has the vision-clipboard hook registered (append-only). */
async function ensureHookRegistered(settingsPath: string): Promise<void> {
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  } catch {
    // No settings file (or unparseable) — start fresh; write only the hook.
  }
  const hooks = (json.hooks as Record<string, unknown>) ?? {};
  const list = (hooks.UserPromptSubmit as Array<Record<string, unknown>>) ?? [];
  const already = JSON.stringify(list).includes("vision-clipboard");
  if (already) return;
  list.push({
    hooks: [
      {
        type: "command",
        command: "bash ~/.claude/hooks/vision-clipboard.sh",
        timeout: 15,
      },
    ],
  });
  (hooks as Record<string, unknown>).UserPromptSubmit = list;
  json.hooks = hooks;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(json, null, 2));
}

/**
 * Sync the bundled skill + hooks into the user's ~/.claude so they follow the
 * npm package version. Never throws. Returns a short report for debugging.
 */
export async function selfSync(overrides: { root?: string; home?: string } = {}): Promise<string[]> {
  if (process.env.VISION_NO_SYNC === "1") return [];
  const root = overrides.root ?? packageRoot();
  const home = overrides.home ?? homeDir();
  const claudeDir = path.join(home, ".claude");
  const report: string[] = [];

  // 1. Skill → ~/.claude/skills/vision/SKILL.md
  const skillSrc = path.join(root, "skills", "vision", "SKILL.md");
  const skillDest = path.join(claudeDir, "skills", "vision", "SKILL.md");
  if (await syncFile(skillSrc, skillDest)) report.push("skill");

  // 2. Hooks → ~/.claude/hooks/
  for (const name of ["vision-clipboard.sh", "vision-capture.mjs"]) {
    const src = path.join(root, "hooks", name);
    const dest = path.join(claudeDir, "hooks", name);
    if (await syncFile(src, dest)) report.push(`hook:${name}`);
  }

  // 3. Ensure settings.json registers the hook.
  await ensureHookRegistered(path.join(claudeDir, "settings.json")).catch(() => {});

  return report;
}
