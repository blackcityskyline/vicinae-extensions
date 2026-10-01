/**
 * YouTube Music has no public search API without a key, so this opens its search
 * page for the thing and lets the user pick. Verified reachable:
 * `music.youtube.com/search?q=…` answers 200. `open()` goes through xdg-open on
 * Linux, which is the default browser.
 */

export function youtubeMusicSearchUrl(query: string): string {
  return `https://music.youtube.com/search?q=${encodeURIComponent(query.trim())}`;
}

/**
 * A track or an album needs its artist in the query or the search returns
 * hundreds of unrelated versions; an artist is just the name.
 */
/** What `named()` puts in place when Last.fm sends no artist at all. */
const UNKNOWN = "Unknown artist";

export function youtubeQuery(subject: { artist?: string; name: string }): string {
  const name = subject.name.trim();
  const artist = subject.artist?.trim();

  // Searching "Unknown artist Roads" returns nothing, so the placeholder goes.
  if (!artist || artist === name || artist === UNKNOWN) return name;
  return `${artist} ${name}`;
}
