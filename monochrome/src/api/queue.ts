import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MusicConfig } from "~/api/player";
import type { Track } from "~/utils/monochrome";

/** What mpv's queue cannot say: a playlist entry is a URL, not a title or a cover. */
export type QueueTrack = {
  trackId: string;
  title: string;
  artists: string[];
  artwork?: string;
};

/** A few albums' worth; the queue in mpv is shorter. */
const LIMIT = 500;

function queuePath(config: MusicConfig): string {
  return join(config.cacheDir, "queue.json");
}

function isQueueTrack(value: unknown): value is QueueTrack {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<QueueTrack>;
  return (
    typeof entry.trackId === "string" &&
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
 * Remembers the metadata of the tracks just queued, newest first, one row per track id. The
 * queue itself stays in mpv; this only lets Now Playing name its entries.
 */
export function rememberTracks(config: MusicConfig, tracks: Track[]): void {
  const entries = tracks.map(
    (track): QueueTrack => ({
      trackId: track.id,
      title: track.title,
      artists: track.artists,
      ...(track.artwork ? { artwork: track.artwork } : {}),
    }),
  );
  if (entries.length === 0) return;

  const fresh = new Set(entries.map((entry) => entry.trackId));
  const kept = readQueueTracks(config).filter((entry) => !fresh.has(entry.trackId));
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
