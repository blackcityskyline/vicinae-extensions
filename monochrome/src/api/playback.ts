import { Toast, showToast } from "@vicinae/api";

import { playQueue, playUrl, queueUrl } from "~/api/mpv";
import { releaseTracks } from "~/api/monochrome";
import { play, type MusicConfig } from "~/api/player";
import { rememberTracks } from "~/api/queue";
import { streamUrl, type Track } from "~/utils/monochrome";

export async function attempt(failureTitle: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    await showToast(
      Toast.Style.Failure,
      failureTitle,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** The queue is a convenience: a read-only cache folder must not block playback. */
function remember(config: MusicConfig, tracks: Track[]): void {
  try {
    rememberTracks(config, tracks);
  } catch {
    // ignore: the music still plays without its title in the queue
  }
}

export function startTrack(track: Track, config: MusicConfig): void {
  remember(config, [track]);
  void attempt("Could not start the player", () => play(track.id, config));
}

export function startNext(track: Track, config: MusicConfig, next: boolean): void {
  remember(config, [track]);
  void attempt("Could not add to the queue", () => queueUrl(streamUrl(track.id), config, next));
}

/** A podcast episode is one URL the feed points at, not a catalog track. */
export function startAudio(url: string, config: MusicConfig): void {
  void attempt("Could not start the player", () => playUrl(url, config));
}

export function queueAudio(url: string, config: MusicConfig, next: boolean): void {
  void attempt("Could not add to the queue", () => queueUrl(url, config, next));
}

/** A collection plays from its first row; a queue is the only thing that knows of an order. */
export function playAll(tracks: Track[], config: MusicConfig): void {
  const first = tracks[0];
  if (!first) return;

  remember(config, tracks);
  void attempt("Could not start playback", async () => {
    if (config.player !== "mpv") {
      await play(first.id, config);
      return;
    }
    await playQueue(
      tracks.map((track) => streamUrl(track.id)),
      config,
    );
  });
}

export function shuffleAll(tracks: Track[], config: MusicConfig): void {
  const mixed = [...tracks];
  for (let index = mixed.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [mixed[index], mixed[swap]] = [mixed[swap]!, mixed[index]!];
  }
  playAll(mixed, config);
}

/** The album is fetched, because the row only knows its id. */
export function startAlbum(releaseId: string, config: MusicConfig): void {
  void attempt("Could not start the album", async () => {
    const release = await releaseTracks(releaseId);
    const urls = release.tracks.map((track) => streamUrl(track.id));
    if (urls.length === 0) throw new Error(`${release.title} has no playable tracks`);

    remember(config, release.tracks);
    if (config.player !== "mpv") {
      const first = release.tracks[0];
      if (first) await play(first.id, config);
      return;
    }
    await playQueue(urls, config);
  });
}

export function queueAlbum(releaseId: string, config: MusicConfig, next: boolean): void {
  void attempt("Could not add the album to the queue", async () => {
    const release = await releaseTracks(releaseId);
    const urls = release.tracks.map((track) => streamUrl(track.id));
    if (urls.length === 0) throw new Error(`${release.title} has no playable tracks`);

    remember(config, release.tracks);
    for (const [index, url] of urls.entries()) {
      await queueUrl(url, config, next || index === 0);
    }
  });
}
