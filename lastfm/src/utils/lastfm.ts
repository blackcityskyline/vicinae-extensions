/**
 * The parts of the Last.fm API kept apart from the network so they can be
 * tested. Everything here is read-only: no method used by this extension needs a
 * signature, a session key or the shared secret, which is why the extension has
 * one password preference and no connect step.
 */

export const ENDPOINT = "https://ws.audioscrobbler.com/2.0/";

export type LastFmImage = { size: string; "#text"?: string };

export type Track = {
  name: string;
  artist: string;
  album: string;
  url: string;
  image?: string;
  /** Recent tracks only. */
  played?: string;
  /** Loved tracks only. */
  loved?: string;
  mbid?: string;
  playcount?: string;
};

export type Artist = {
  name: string;
  url: string;
  image?: string;
  playcount: string;
  /** The rank Last.fm reported, not the row number. */
  rank: number;
};

export type Album = {
  name: string;
  artist: string;
  url: string;
  image?: string;
  playcount?: string;
  /** The rank Last.fm reported, not the row number. */
  rank: number;
};

type Params = Record<string, string | number | undefined>;

/**
 * Sorted, encoded, and always sent even when empty: Last.fm treats `user=` and a
 * missing `user` differently, so dropping an empty value would change the error
 * you get rather than the request you make.
 */
export function requestUrl(method: string, params: Params): string {
  const query = Object.keys(params)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(String(params[key] ?? ""))}`)
    .join("&");

  return `${ENDPOINT}?method=${method}&${query}`;
}

const SIZE_ORDER = ["mega", "extralarge", "large", "medium", "small"];

/** The biggest artwork offered, or nothing. Last.fm sends "" for missing art. */
export function imageUrl(images: LastFmImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;

  for (const size of SIZE_ORDER) {
    const url = images.find((image) => image.size === size)?.["#text"];
    if (url && isUsableImage(url)) return url;
  }

  return undefined;
}

/**
 * Artwork comes from a URL the API chose, so it is checked before it becomes an
 * icon. The placeholder Last.fm sends for tracks with no cover is not usable.
 */
function isUsableImage(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  if (!/\.(png|jpe?g|gif|webp)$/i.test(url)) return false;
  return !/placeholder|default|noimage|blank/i.test(url);
}

/**
 * A collection of one comes back as a bare object, not an array of one. This is
 * the shape that makes an extension show an empty list for a user with exactly
 * one recent track, so it is handled in one place.
 */
export function unwrapList<T>(value: T[] | T | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

type Stamped = { date?: { "#text"?: string; uts?: string } | string };

/**
 * `date` is an object on recent tracks and a bare string on top ones, and a track
 * that is playing right now has none at all.
 */
export function playedAt(entry: Stamped): string | undefined {
  const date = entry.date;
  if (!date) return undefined;
  if (typeof date === "string") return date;
  return date["#text"] ?? (date.uts ? new Date(Number(date.uts) * 1000).toISOString() : undefined);
}

/** The API answers with a number; these are the ones worth naming. */
export function errorFor(code: number): string {
  switch (code) {
    case 2:
      return "The service is not available.";
    case 6:
      return "No such Last.fm username. Check it in Settings.";
    case 8:
      return "The operation needs a signed-in session, which this extension does not use.";
    case 10:
      return "The API key is not valid. Check it in Settings.";
    case 13:
      return "No artwork for that item.";
    case 29:
      return "Rate limited by Last.fm. Wait a minute and refresh.";
    default:
      // An unknown code is the only clue there is, so it stays in the message.
      return `Last.fm answered with error ${code}.`;
  }
}
