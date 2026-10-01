import { LastFmError, checked, named, unwrapList, type LfmArtist, type LfmTrack } from "~/utils/lastfm";

/**
 * The read-only calls behind the Browse command.
 *
 * Response members were measured one at a time against the live endpoint, because
 * they differ per method and reading the wrong one does not fail — it returns
 * `undefined`, which unwraps to an empty list, which renders as "nothing here".
 * Every list goes through `checked`, so a mismatch says so instead of looking like
 * an empty account.
 *
 * No key of ours, no session: all of these answer with a read-only API key.
 */

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";

export type ArtistInfo = {
  name: string;
  url: string;
  listeners: string;
  playcount: string;
  tags: string[];
  similar: LfmArtist[];
  bio: string;
  image?: string;
};

async function call(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const query = new URLSearchParams({ method, format: "json", ...params }).toString();
  const response = await fetch(`${BASE_URL}?${query}`);

  if (!response.ok) {
    const detail = (await response.text()).match(/<title>([^<]*)<\/title>/)?.[1];
    throw new LastFmError(`Last.fm answered ${response.status}${detail ? `, ${detail}` : ""}.`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.error === "number") {
    throw new LastFmError(`Last.fm error ${body.error}: ${String(body.message ?? "no message")}`);
  }

  return body;
}

const attrs = (value: unknown): Record<string, string> | undefined =>
  value && typeof value === "object" ? (value as Record<string, string>) : undefined;

const member = (body: Record<string, unknown>, name: string): Record<string, unknown> | undefined =>
  body[name] && typeof body[name] === "object" ? (body[name] as Record<string, unknown>) : undefined;

/** The global charts. Neither needs a username. */
export async function globalChart(apiKey: string): Promise<{ artists: LfmArtist[]; tracks: LfmTrack[] }> {
  const [artists, tracks] = await Promise.all([
    call("chart.getTopArtists", { api_key: apiKey, limit: "50" }),
    call("chart.getTopTracks", { api_key: apiKey, limit: "50" }),
  ]);

  const artistSlot = member(artists, "artists");
  const trackSlot = member(tracks, "tracks");

  return {
    artists: checked(unwrapList(artistSlot?.artist as LfmArtist[]), attrs(artistSlot?.["@attr"]), "charted artists"),
    tracks: checked(unwrapList(trackSlot?.track as LfmTrack[]), attrs(trackSlot?.["@attr"]), "charted tracks"),
  };
}

/**
 * The weekly charts for one account.
 *
 * `user.getWeeklyChartList` is useless: measured, 1128 entries and every one of
 * them `{ "#text": "", from, to }`. The per-artist and per-track methods are the
 * ones that carry rows.
 */
export async function weeklyChart(
  apiKey: string,
  username: string,
): Promise<{ artists: LfmArtist[]; tracks: LfmTrack[] }> {
  const [artists, tracks] = await Promise.all([
    call("user.getWeeklyArtistChart", { api_key: apiKey, user: username }),
    call("user.getWeeklyTrackChart", { api_key: apiKey, user: username }),
  ]);

  const artistSlot = member(artists, "weeklyartistchart");
  const trackSlot = member(tracks, "weeklytrackchart");

  return {
    artists: checked(
      unwrapList(artistSlot?.artist as LfmArtist[]),
      attrs(artistSlot?.["@attr"]),
      "weekly artists",
    ),
    tracks: checked(unwrapList(trackSlot?.track as LfmTrack[]), attrs(trackSlot?.["@attr"]), "weekly tracks"),
  };
}

export async function libraryArtists(apiKey: string, username: string, page: number): Promise<LfmArtist[]> {
  const body = await call("library.getArtists", { api_key: apiKey, user: username, page: String(page) });
  const slot = member(body, "artists");

  return checked(unwrapList(slot?.artist as LfmArtist[]), attrs(slot?.["@attr"]), "library artists");
}

export async function searchArtists(apiKey: string, artist: string, limit = 25): Promise<LfmArtist[]> {
  const body = await call("artist.search", { api_key: apiKey, artist, limit: String(limit) });
  const slot = member(body, "results");
  const matches = slot?.artistmatches as Record<string, unknown> | undefined;

  return unwrapList(matches?.artist as LfmArtist[]);
}

export async function artistInfo(apiKey: string, artist: string): Promise<ArtistInfo> {
  const body = await call("artist.getInfo", { api_key: apiKey, artist });
  const info = member(body, "artist");

  if (!info) throw new LastFmError(`Last.fm has nothing about "${artist}".`);

  const stats = (info.stats ?? {}) as Record<string, string>;
  const bio = ((info.bio ?? {}) as Record<string, unknown>).summary as string | undefined;
  const similar = ((info.similar ?? {}) as Record<string, unknown>).artist;

  return {
    name: typeof info.name === "string" ? info.name : artist,
    url: typeof info.url === "string" ? info.url : "",
    listeners: String(stats.listeners ?? "0"),
    playcount: String(stats.playcount ?? "0"),
    // Measured: tags arrive as [{name, url}], not as strings.
    tags: unwrapList(((info.tags ?? {}) as Record<string, unknown>).tag as { name?: string }[])
      .map((tag) => tag?.name ?? "")
      .filter(Boolean),
    similar: unwrapList(similar as LfmArtist[]).map((entry) => ({ ...entry, url: entry.url ?? "" })),
    // The summary arrives as HTML; the caller strips it.
    bio: bio ?? "",
  };
}

/** The track name as it should read in a row: `Artist — Track`. */
export function trackLabel(track: LfmTrack): string {
  const artist = named(track.artist, "");
  return artist ? `${artist} — ${track.name}` : track.name;
}