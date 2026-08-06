import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { selfSync } from "./self-sync.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("selfSync", () => {
  let root: string;
  let home: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "sync-root-"));
    home = await fs.mkdtemp(path.join(os.tmpdir(), "sync-home-"));
    // Minimal bundled layout: skills/vision/SKILL.md + hooks/*.
    const skill = path.join(root, "skills", "vision");
    const hooks = path.join(root, "hooks");
    await fs.mkdir(skill, { recursive: true });
    await fs.mkdir(hooks, { recursive: true });
    await fs.writeFile(path.join(skill, "SKILL.md"), "# vision skill\n");
    await fs.writeFile(path.join(hooks, "vision-clipboard.sh"), "#!/usr/bin/env bash\necho hi\n");
    await fs.writeFile(path.join(hooks, "vision-capture.mjs"), "console.log('detect');\n");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(home, { recursive: true, force: true });
  });

  it("copies the skill and hooks into ~/.claude", async () => {
    const report = await selfSync({ root, home });
    expect(report).toEqual(
      expect.arrayContaining(["skill", "hook:vision-clipboard.sh", "hook:vision-capture.mjs"]),
    );
    const skill = await fs.readFile(
      path.join(home, ".claude", "skills", "vision", "SKILL.md"),
      "utf8",
    );
    expect(skill).toBe("# vision skill\n");
    await expect(
      fs.access(path.join(home, ".claude", "hooks", "vision-clipboard.sh")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(home, ".claude", "hooks", "vision-capture.mjs")),
    ).resolves.toBeUndefined();
  });

  it("is idempotent: does not rewrite unchanged files", async () => {
    await selfSync({ root, home });
    const dest = path.join(home, ".claude", "skills", "vision", "SKILL.md");
    const mtime1 = (await fs.stat(dest)).mtimeMs;
    // Sleep briefly so a rewrite would be detectable by mtime.
    await new Promise((r) => setTimeout(r, 20));
    const report = await selfSync({ root, home });
    expect(report).toEqual([]); // nothing changed
    const mtime2 = (await fs.stat(dest)).mtimeMs;
    expect(mtime2).toBe(mtime1);
  });

  it("registers the hook in settings.json when missing", async () => {
    await selfSync({ root, home });
    const settings = JSON.parse(
      await fs.readFile(path.join(home, ".claude", "settings.json"), "utf8"),
    );
    const json = JSON.stringify(settings.hooks);
    expect(json).toContain("vision-clipboard");
  });

  it("honors VISION_NO_SYNC=1", async () => {
    const prev = process.env.VISION_NO_SYNC;
    process.env.VISION_NO_SYNC = "1";
    try {
      const report = await selfSync({ root, home });
      expect(report).toEqual([]);
      await expect(
        fs.access(path.join(home, ".claude", "skills", "vision", "SKILL.md")),
      ).rejects.toThrow();
    } finally {
      if (prev === undefined) delete process.env.VISION_NO_SYNC;
      else process.env.VISION_NO_SYNC = prev;
    }
  });

  it("does not break when the bundled skill is missing", async () => {
    await fs.rm(path.join(root, "skills"), { recursive: true, force: true });
    const report = await selfSync({ root, home });
    // Hooks still sync; skill silently skipped, no throw.
    expect(Array.isArray(report)).toBe(true);
  });
});
