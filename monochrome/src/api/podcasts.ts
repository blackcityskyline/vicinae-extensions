import type { MusicConfig } from "~/api/player";
import { parseEpisodes, parsePodcasts, podcastAuth, type Episode, type Podcast } from "~/utils/podcasts";

const PODCAST_ORIGIN = "https://api.podcastindex.org/api/1.0";
const TIMEOUT_MS = 10_000;
const PAGE = 50;

async function podcastIndex(path: string, config: MusicConfig): Promise<unknown> {
  if (config.podcastKey === "" || config.podcastSecret === "") {
    throw new Error(
      "Podcasts need a PodcastIndex API key: fill in API Key and API Secret in the extension preferences",
    );
  }

  const headers = {
    accept: "application/json",
    "user-agent": "Monochrome/1.0",
    ...podcastAuth(config.podcastKey, config.podcastSecret, Math.floor(Date.now() / 1000)),
  };

  const response = await fetch(`${PODCAST_ORIGIN}${path}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`PodcastIndex answered ${response.status} for ${path.split("?")[0]}`);
  }
  return response.json().catch(() => {
    throw new Error("PodcastIndex answered with something that is not JSON");
  });
}

export async function searchPodcasts(text: string, config: MusicConfig): Promise<Podcast[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return parsePodcasts(
    await podcastIndex(`/search/byterm?q=${encodeURIComponent(trimmed)}&max=20&pretty`, config),
  );
}

/** The feed answers 50 episodes at a time, so the list has real pages. */
export async function podcastEpisodes(
  id: number,
  config: MusicConfig,
  offset = 0,
): Promise<{ episodes: Episode[]; hasMore: boolean }> {
  const episodes = parseEpisodes(
    await podcastIndex(`/episodes/byfeedid?id=${id}&max=${PAGE}&offset=${offset}&pretty`, config),
  );
  return { episodes, hasMore: episodes.length === PAGE };
}
