import { plays, stripHtml } from "~/utils/lastfm";
import type { ArtistPage } from "~/api/lastfm";

/**
 * The whole artist page as one markdown document, so it is a pure function and
 * can be checked without a window. A wiki summary is HTML, so it is stripped
 * rather than pasted in.
 */
export function artistMarkdown(artist: ArtistPage): string {
  const out: string[] = [`# ${artist.name}`];

  const numbers = [
    plays(artist.listeners) && `${plays(artist.listeners)} listeners`,
    plays(artist.playcount) && `${plays(artist.playcount)} plays`,
  ].filter(Boolean);
  if (numbers.length > 0) out.push(numbers.join(" · "));

  if (artist.tags.length > 0) out.push(artist.tags.slice(0, 8).join(" · "));

  const summary = stripHtml(artist.summary);
  if (summary) out.push(summary);

  if (artist.tracks.length > 0) {
    out.push("## Top tracks", "");
    for (const [index, entry] of artist.tracks.entries()) {
      const count = plays(entry.playcount);
      out.push(`${index + 1}. **${entry.name}**${count ? ` — ${count}` : ""}`);
    }
  }

  if (artist.albums.length > 0) {
    out.push("", "## Top albums", "");
    for (const entry of artist.albums) {
      const count = plays(entry.playcount);
      out.push(`- **${entry.name}**${count ? ` — ${count}` : ""}`);
    }
  }

  if (artist.similar.length > 0) {
    out.push("", "## Similar", "");
    for (const entry of artist.similar) {
      const listeners = plays(entry.listeners);
      out.push(`- ${entry.name}${listeners ? ` — ${listeners} listeners` : ""}`);
    }
  }

  return out.join("\n");
}
