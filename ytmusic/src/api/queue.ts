import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { PlayerState } from "~/api/mpv";
import type { MusicConfig } from "~/api/player";
import { videoIdFromUrl, type MusicTrack } from "~/utils/ytmusic";

/**
 * What mpv's queue cannot say: a playlist entry is a URL, not a title or an
 * artist. The cover is not stored — the ones YouTube sends back are 120 px, and
 * some are channel avatars; `thumbnailUrl(videoId)` is the song's own art.
 */
export type QueueTrack = {
  videoId: string;
  title: string;
  artists: string[];
};

/** One row of the Queue section: mpv's position and the metadata for that URL. */
export type QueueRow = {
  /** mpv's own index in its playlist; a skipped entry leaves a gap here. */
  position: number;
  url: string;
  videoId: string;
  title: string;
  artists: string;
};

/**
 * The queue mpv reports, minus everything the launcher did not put there.
 *
 * mpv keeps one playlist per server, so a video opened in its window, or a file
 * another tool loaded, sits in it too — and has no title, artist or cover here,
 * which is what made those entries list as `Video <id>`. Only the tracks Browse
 * remembered are shown; `position` stays mpv's index so playing a row still
 * jumps to the right entry.
 */
export function queueRows(state: PlayerState, tracks: Map<string, QueueTrack>): QueueRow[] {
  return state.queue.flatMap((url, position) => {
    const videoId = videoIdFromUrl(url);
    const track = videoId ? tracks.get(videoId) : undefined;
    if (!videoId || !track) return [];
    return [
      {
        position,
        url,
        videoId,
        title: track.title,
        artists: track.artists.join(", "),
      },
    ];
  });
}

/** A few playlists' worth; the queue in mpv is shorter. */
const LIMIT = 500;

export function queuePath(config: MusicConfig): string {
  return join(config.cacheDir, "queue.json");
}

function isQueueTrack(value: unknown): value is QueueTrack {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<QueueTrack>;
  return (
    typeof entry.videoId === "string" &&
    typeof entry.title === "string" &&
    Array.isArray(entry.artists)
  );
}

/** An absent or damaged file means no metadata, never a failed view. */
export function readQueueTracks(config: MusicConfig): QueueTrack[] {
  try {
    const value: unknown = JSON.parse(readFileSync(queuePath(config), "utf8"));
    return Array.isArray(value) ? value.filter(isQueueTrack) : [];
  } catch {
    return [];
  }
}

/**
 * Remembers the metadata of the tracks just queued, newest first, one row per video id. The
 * queue itself stays in mpv; this only lets Now Playing name its entries.
 */
export function rememberTracks(config: MusicConfig, tracks: MusicTrack[]): void {
  const entries = tracks.flatMap((track): QueueTrack[] => {
    if (!track.videoId) return [];
    return [
      {
        videoId: track.videoId,
        title: track.title,
        artists: track.artists.map((artist) => artist.name),
      },
    ];
  });
  if (entries.length === 0) return;

  const fresh = new Set(entries.map((entry) => entry.videoId));
  const kept = readQueueTracks(config).filter((entry) => !fresh.has(entry.videoId));
  writeQueue(config, [...entries, ...kept].slice(0, LIMIT));
}

function writeQueue(config: MusicConfig, tracks: QueueTrack[]): void {
  const path = queuePath(config);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;

  try {
    writeFileSync(temporary, `${JSON.stringify(tracks, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
