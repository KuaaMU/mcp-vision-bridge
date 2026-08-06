/**
 * Cross-platform filesystem path helpers shared across the codebase.
 *
 * Claude Code and most coding agents store user state under the home directory,
 * but the home is located differently per OS (Windows USERPROFILE, POSIX HOME).
 * These helpers normalize that so scanners (discovery) and sync (self-sync)
 * agree on where to look.
 */
import * as os from "node:os";
import * as path from "node:path";

/** Home directory: USERPROFILE on Windows, HOME elsewhere, os.homedir fallback. */
export function homeDir(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();
}

/** Windows %LOCALAPPDATA%, else ~/.local/share (XDG data home). */
export function localAppDataDir(): string {
  if (process.env.LOCALAPPDATA) return process.env.LOCALAPPDATA;
  return path.join(homeDir(), ".local", "share");
}

/** Windows %APPDATA%, else ~/.config (XDG config home). */
export function appDataDir(): string {
  if (process.env.APPDATA) return process.env.APPDATA;
  return path.join(homeDir(), ".config");
}
