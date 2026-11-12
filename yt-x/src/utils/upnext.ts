/** The related list as one file the player walks by itself: mpv and vlc both read an m3u. */
import type { Entry } from "~/types";

/** A line break in a title would end the entry and leave a bogus URL behind. */
function label(entry: Entry): string {
  return entry.title.replace(/[\r\n]+/g, " ");
}

export function playlistText(entries: Entry[]): string {
  const lines = ["#EXTM3U"];
  for (const entry of entries) {
    lines.push(`#EXTINF:${entry.duration ?? -1},${label(entry)}`);
    lines.push(entry.url);
  }
  return `${lines.join("\n")}\n`;
}
