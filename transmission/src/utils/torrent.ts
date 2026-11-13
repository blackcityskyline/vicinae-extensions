/** What counts as a torrent is decided here, so the rule can be tested. */

import os from "node:os";
import path from "node:path";

/** A magnet, an http(s) link to a .torrent, or a path to a local .torrent file. */
export function looksLikeTorrent(text: string): boolean {
  const value = text.trim();
  if (value === "" || value.includes("\n")) return false;
  if (value.startsWith("magnet:?")) return true;
  if (/^https?:\/\/.+\.torrent(\?.*)?$/i.test(value)) return true;
  return /\.torrent$/i.test(value);
}

/**
 * The daemon does not expand `~`: a quick path pasted into the form has to become
 * an absolute path before it is sent, or the torrent lands in a literal `~` folder.
 */
export function expandHome(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") return os.homedir();
  if (trimmed.startsWith("~/")) return path.join(os.homedir(), trimmed.slice(2));
  return trimmed;
}
