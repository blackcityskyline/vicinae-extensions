/** What counts as a torrent is decided here, so the rule can be tested. */

/** A magnet, an http(s) link to a .torrent, or a path to a local .torrent file. */
export function looksLikeTorrent(text: string): boolean {
  const value = text.trim();
  if (value === "" || value.includes("\n")) return false;
  if (value.startsWith("magnet:?")) return true;
  if (/^https?:\/\/.+\.torrent(\?.*)?$/i.test(value)) return true;
  return /\.torrent$/i.test(value);
}
