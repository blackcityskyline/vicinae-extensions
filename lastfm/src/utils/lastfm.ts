/**
 * Reading Last.fm's answers.
 *
 * The API is a bag of positional members with no schema, and every one of these
 * helpers exists because something about it is not what the shape suggests. All of
 * it was measured against the live endpoint; see `docs/audits/lastfm.md`.
 */

/** Last.fm sends `""` for an account with no artwork. */
export class LastFmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LastFmError";
  }
}

export type Named = { name?: string; "#text"?: string };

export type LfmImage = { size: string; "#text": string };

export type LfmArtist = {
  name: string;
  url: string;
  image?: LfmImage[];
  playcount?: string;
  listeners?: string;
  mbid?: string;
  streamable?: string;
  tagcount?: string;
};

export type LfmTrack = {
  name: string;
  url: string;
  image?: LfmImage[];
  artist?: Named;
  album?: Named;
  playcount?: string;
  listeners?: string;
  mbid?: string;
};

/**
 * An artist is named two ways: `getrecenttracks` sends `artist["#text"]`, while
 * `getlovedtracks` and `gettopalbums` send `artist.name`. Reading one leaves every
 * row from the other showing the fallback.
 */
export function named(value: Named | undefined, fallback = "Unknown artist"): string {
  return value?.name || value?.["#text"] || fallback;
}

/**
 * A collection of one arrives as a bare object, not an array of one. Measured with
 * `limit=1`. Anything that reads `body.members.thing` has to come through here.
 */
export function unwrapList<T>(value: T[] | T | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** The largest image that actually has a url behind it. */
export function imageUrl(images?: LfmImage[]): string | undefined {
  const usable = (images ?? []).map((image) => image["#text"]).filter(Boolean);
  return usable[usable.length - 1];
}

/** Paging and counts arrive as strings inside `@attr`. */
export function attrNumber(attrs: Record<string, string> | undefined, key: string): number {
  return Number(attrs?.[key]) || 0;
}

/**
 * Refuse an empty answer when the API said there would be rows.
 *
 * Reading the wrong member name gives `undefined`, `unwrapList` turns that into an
 * empty list, and an empty list is indistinguishable from an account with nothing
 * in it. A port shipped that way and rendered "no top artists" for an account with
 * 198 of them, because the live test only asserted `Array.isArray`, and an empty
 * array is an array.
 *
 * Measured response members, since they differ per method and getting one wrong is
 * the failure this catches:
 *
 *   user.gettopartists   -> topartists          chart.getTopArtists -> artists
 *   user.gettopalbums    -> topalbums           chart.getTopTracks  -> tracks
 *   user.getTopTracks    -> toptracks           library.getArtists  -> artists
 *   user.getrecenttracks -> recenttracks        artist.search       -> results.artistmatches
 *   user.getlovedtracks  -> lovedtracks         artist.getInfo      -> artist
 *   user.getWeeklyArtistChart -> weeklyartistchart
 *   user.getWeeklyTrackChart  -> weeklytrackchart
 */
export function checked<T>(rows: T[], attrs: Record<string, string> | undefined, what: string): T[] {
  const reported = attrNumber(attrs, "total");
  if (reported > 0 && rows.length === 0) {
    throw new LastFmError(`Last.fm reported ${reported} ${what} and sent none that could be read.`);
  }
  return rows;
}

/** Bio summaries arrive as HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}