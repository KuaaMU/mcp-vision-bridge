/**
 * Optional sidecar output for long descriptions.
 *
 * When `save_to` is provided, the full description is written to a file and
 * the tool returns a short summary plus the path — so a text-only agent never
 * has to carry a huge blob through its context window.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ioError } from "./errors.js";

export async function saveDescription(
  filePath: string,
  text: string,
): Promise<string> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, text, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw ioError(`Could not write description to "${filePath}": ${message}`);
  }
  return filePath;
}
