/**
 * Where a row can be opened besides Last.fm.
 *
 * Both are search pages and the default browser, nothing more: neither has a public
 * API that answers without a key. YouTube Music is verified 200. Monochrome lives at
 * `monochrome.st` — the `.tf` host answers 503 with a page whose entire content is a
 * meta refresh to `.st`. Measured in `docs/monochrome.md`.
 */

export type Site = "youtube" | "monochrome";

/** The two services, and the name the action is titled with. */
export const SITES: Record<Site, string> = {
  youtube: "YouTube Music",
  monochrome: "Monochrome",
};

export function siteSearchUrl(site: Site, query: string): string {
  const encoded = encodeURIComponent(query.trim());
  return site === "youtube"
    ? `https://music.youtube.com/search?q=${encoded}`
    : `https://monochrome.st/search/${encoded}`;
}

/** What `named()` puts in place when Last.fm sends no artist at all. */
const UNKNOWN = "Unknown artist";

/**
 * A track or an album needs its artist in the query, or the search returns hundreds
 * of unrelated versions. An artist is just the name.
 */
export function siteQuery(subject: { artist?: string; name: string }): string {
  const name = subject.name.trim();
  const artist = subject.artist?.trim();

  // Searching "Unknown artist Roads" finds nothing at all, so the placeholder goes.
  if (!artist || artist === name || artist === UNKNOWN) return name;
  return `${artist} ${name}`;
}