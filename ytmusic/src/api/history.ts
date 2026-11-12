import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MusicConfig } from "~/api/player";
import type { MusicTrack } from "~/utils/ytmusic";

/** One Play, kept locally so the root list shows what this machine has played. */
export type PlayedTrack = {
  videoId: string;
  title: string;
  artists: string[];
  /** The largest thumbnail YouTube sent with the row. */
  thumbnail?: string;
  playedAt: number;
};

/** Enough for a "Recently played" page; the server history is longer. */
const LIMIT = 50;

export function historyPath(config: MusicConfig): string {
  return join(config.cacheDir, "history.json");
}

function isPlayed(value: unknown): value is PlayedTrack {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<PlayedTrack>;
  return (
    typeof entry.videoId === "string" &&
    typeof entry.title === "string" &&
    Array.isArray(entry.artists) &&
    typeof entry.playedAt === "number"
  );
}

/** An absent or damaged file means no history, never a failed view. */
export function readHistory(config: MusicConfig): PlayedTrack[] {
  try {
    const value: unknown = JSON.parse(readFileSync(historyPath(config), "utf8"));
    return Array.isArray(value) ? value.filter(isPlayed) : [];
  } catch {
    return [];
  }
}

/**
 * Records a play, newest first, one row per song. The file is replaced through a
 * temporary rename, so a kill mid-write cannot leave half a history behind.
 */
export function recordPlay(config: MusicConfig, track: MusicTrack, now: number = Date.now()): void {
  const videoId = track.videoId;
  if (!videoId) return;

  const thumbnail = track.thumbnails[track.thumbnails.length - 1]?.url;
  const entry: PlayedTrack = {
    videoId,
    title: track.title,
    artists: track.artists.map((artist) => artist.name),
    playedAt: now,
    ...(thumbnail ? { thumbnail } : {}),
  };
  const kept = readHistory(config).filter((played) => played.videoId !== videoId);
  writeHistory(config, [entry, ...kept].slice(0, LIMIT));
}

function writeHistory(config: MusicConfig, history: PlayedTrack[]): void {
  const path = historyPath(config);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;

  try {
    writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
