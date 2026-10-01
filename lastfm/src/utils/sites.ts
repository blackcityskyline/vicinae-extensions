/**
 * The sites a music row can be opened on, and the search url each one takes.
 *
 * Both are just a search page and a default browser, exactly like opening a link:
 * YouTube Music has no public search API without a key, so it opens its results
 * page and lets you pick (verified 200). Everything goes through one builder, so
 * a title with an `&` in it can never turn into a second parameter.
 */

/** What `named()` puts in place when Last.fm sends no artist at all. */
const UNKNOWN = "Unknown artist";

const SITES = {
  "youtube-music": {
    label: "YouTube Music",
    url: (query: string) => `https://music.youtube.com/search?q=${encodeURIComponent(query)}`,
  },
  monochrome: {
    label: "Monochrome",
    url: (query: string) => `https://monochrome.st/search?q=${encodeURIComponent(query)}`,
  },
};

export type Site = keyof typeof SITES;

export function siteLabel(site: Site): string {
  return SITES[site].label;
}

/**
 * A track or an album needs its artist in the query or the search returns
 * hundreds of unrelated versions; an artist is just the name.
 */
function searchQuery(subject: { artist?: string; name: string }): string {
  const name = subject.name.trim();
  const artist = subject.artist?.trim();

  // Searching "Unknown artist Roads" finds nothing, so the placeholder goes.
  if (!artist || artist === name || artist === UNKNOWN) return name;
  return `${artist} ${name}`;
}

export function siteSearchUrl(site: Site, subject: { artist?: string; name: string }): string {
  return SITES[site].url(searchQuery(subject));
}