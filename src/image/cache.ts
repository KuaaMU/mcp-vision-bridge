/**
 * Sidecar cache for decoded image bytes.
 *
 * A two-tier cache: an in-memory LRU map for the fast path plus an optional
 * on-disk directory so an image fetched once can be re-analyzed after a server
 * restart without re-downloading.
 *
 * The on-disk cache is append-only and keyed by a hash of the source string.
 * If `cacheDir` is unset, only the in-memory tier is active.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

export class ImageCache {
  private readonly memory = new Map<string, Buffer>();
  private readonly memoryLimit: number;

  constructor(
    readonly cacheDir: string | null = null,
    memoryLimit = 128,
  ) {
    this.memoryLimit = memoryLimit;
  }

  /** Hash the source string into a stable filename-safe id. */
  static keyFor(source: string): string {
    return createHash("sha1").update(source).digest("hex");
  }

  private memoryPath(source: string): string {
    return `mem:${ImageCache.keyFor(source)}`;
  }

  private diskPath(source: string): string {
    return path.join(this.cacheDir!, `${ImageCache.keyFor(source)}.img`);
  }

  /** Returns cached bytes for `source`, or null on a miss. */
  async get(source: string): Promise<Buffer | null> {
    const memKey = this.memoryPath(source);
    if (this.memory.has(memKey)) {
      const value = this.memory.get(memKey)!;
      // Refresh LRU position.
      this.memory.delete(memKey);
      this.memory.set(memKey, value);
      return value;
    }

    if (this.cacheDir !== null) {
      try {
        return await fs.readFile(this.diskPath(source));
      } catch {
        return null;
      }
    }

    return null;
  }

  /** Store bytes under `source`, evicting LRU entries when over memory limit. */
  async set(source: string, bytes: Buffer): Promise<void> {
    const memKey = this.memoryPath(source);
    this.memory.set(memKey, bytes);
    if (this.memory.size > this.memoryLimit) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }

    if (this.cacheDir !== null) {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.diskPath(source), bytes);
    }
  }
}
