/** Where a download lands: one folder per artist, one per album, numbered like the release. */
import { join } from "node:path";

import type { Track } from "~/utils/monochrome";

/** What a filesystem can hold: a slash in a title is not a folder. */
export function safeName(text: string): string {
  const cleaned = text.replace(/[/\\:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned === "" ? "Untitled" : cleaned;
}

export function trackPath(track: Track, downloadDir: string, album?: string): string {
  const artist = safeName(track.artists[0] ?? "Unknown Artist");
  const number = track.trackNumber === undefined ? "" : `${String(track.trackNumber).padStart(2, "0")} `;
  const folders = album === undefined ? [artist] : [artist, safeName(album)];
  return join(downloadDir, ...folders, `${number}${safeName(track.title)}.flac`);
}
