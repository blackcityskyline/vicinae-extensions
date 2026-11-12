/**
 * Monochrome's podcast tab is PodcastIndex (api.podcastindex.org), called from the browser with
 * an API key. The parsing is the part worth a check: an item that loses a field must drop out of
 * the list, not break the view.
 */

import { createHash } from "node:crypto";

import { asArray, asRecord, asText } from "~/utils/monochrome";

const WEB_ORIGIN = "https://monochrome.st";

export type Podcast = {
  id: number;
  title: string;
  author?: string;
  artwork?: string;
  description?: string;
  episodeCount?: number;
};

export type Episode = {
  id: number;
  title: string;
  /** The feed the episode belongs to: the web page it opens. */
  podcastId?: number;
  podcastTitle?: string;
  artwork?: string;
  /** The mp3 (or m4a) the feed points at: what mpv plays. */
  audio: string;
  /** Whole seconds. */
  duration?: number;
  published?: string;
};

/** PodcastIndex signs each request with the date, the key and the secret. */
export function podcastAuth(
  key: string,
  secret: string,
  date: number,
): { "X-Auth-Key": string; "X-Auth-Date": string; Authorization: string } {
  const stamp = String(date);
  return {
    "X-Auth-Key": key,
    "X-Auth-Date": stamp,
    Authorization: createHash("sha1").update(`${key}${secret}${stamp}`).digest("hex"),
  };
}

export function podcastUrl(id: number): string {
  return `${WEB_ORIGIN}/podcasts/${id}`;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function parsePodcast(value: unknown): Podcast | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = number(raw.id);
  const title = asText(raw.title);
  if (id === undefined || !title) return null;

  const author = asText(raw.author) ?? asText(raw.ownerName);
  const artwork = asText(raw.image);
  const description = asText(raw.description);
  const episodeCount = number(raw.episodeCount);

  return {
    id,
    title,
    ...(author ? { author } : {}),
    ...(artwork ? { artwork } : {}),
    ...(description ? { description } : {}),
    ...(episodeCount === undefined ? {} : { episodeCount }),
  };
}

function parseEpisode(value: unknown): Episode | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const id = number(raw.id);
  const title = asText(raw.title);
  const audio = asText(raw.enclosureUrl);
  // an episode without an enclosure has nothing to play, and feeds do carry those
  if (id === undefined || !title || !audio) return null;

  const podcastId = number(raw.feedId);
  const podcastTitle = asText(raw.feedTitle);
  const artwork = asText(raw.image) ?? asText(raw.feedImage);
  const duration = number(raw.duration);
  const seconds = number(raw.datePublished);

  return {
    id,
    title,
    audio,
    ...(podcastId === undefined ? {} : { podcastId }),
    ...(podcastTitle ? { podcastTitle } : {}),
    ...(artwork ? { artwork } : {}),
    ...(duration === undefined || duration <= 0 ? {} : { duration }),
    ...(seconds === undefined ? {} : { published: new Date(seconds * 1000).toISOString().slice(0, 10) }),
  };
}

/** `/search/byterm` and `/podcasts/trending` both answer `{feeds: [...]}`. */
export function parsePodcasts(value: unknown): Podcast[] {
  const raw = asRecord(value);
  return asArray(raw?.feeds).flatMap((entry) => {
    const podcast = parsePodcast(entry);
    return podcast ? [podcast] : [];
  });
}

/** `/episodes/byfeedid` answers `{items: [...]}`. */
export function parseEpisodes(value: unknown): Episode[] {
  const raw = asRecord(value);
  return asArray(raw?.items).flatMap((entry) => {
    const episode = parseEpisode(entry);
    return episode ? [episode] : [];
  });
}
