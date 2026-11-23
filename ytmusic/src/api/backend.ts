import * as daemon from "~/api/daemon";
import * as mpv from "~/api/mpv";
import type { ControlAction, PlayerState } from "~/api/mpv";
import type { MusicConfig } from "~/api/player";
import { readQueueTracks } from "~/api/queue";
import { musicTrackUrl, type MusicTrack } from "~/utils/ytmusic";

/**
 * One set of verbs for the two ways to play: the launcher's own mpv, or `ytmusicd`. The views
 * call these and never learn which one answered.
 */
const use = (config: MusicConfig) => (config.backend === "daemon" ? "daemon" : "mpv");

export function playTracks(tracks: MusicTrack[], config: MusicConfig): Promise<void> {
  if (use(config) === "daemon") return daemon.playTracks(tracks, config);
  return mpv.playQueue(
    tracks.flatMap((track) => (track.videoId ? [musicTrackUrl(track.videoId)] : [])),
    config,
  );
}

export function queueTrack(track: MusicTrack, config: MusicConfig, next: boolean): Promise<void> {
  if (use(config) === "daemon") return daemon.queueTrack(track, config, next);
  return track.videoId ? mpv.queueUrl(musicTrackUrl(track.videoId), config, next) : Promise.resolve();
}

/**
 * Plays what played last. The daemon resumes its own queue at the entry and position it
 * stopped at; the plain mpv keeps no resume point, so its queue is replayed from the start.
 * False when there is nothing to play.
 */
export async function resume(config: MusicConfig): Promise<boolean> {
  if (use(config) === "daemon") return daemon.resume(config);

  const urls = readQueueTracks(config).map((track) => musicTrackUrl(track.videoId));
  if (urls.length === 0) return false;
  await mpv.playQueue(urls, config);
  return true;
}

export function playerState(config: MusicConfig): Promise<PlayerState | null> {
  return use(config) === "daemon" ? daemon.playerState(config) : mpv.playerState(config);
}

export function control(config: MusicConfig, action: ControlAction): Promise<void> {
  return use(config) === "daemon" ? daemon.control(config, action) : mpv.control(config, action);
}

export function jump(config: MusicConfig, index: number): Promise<void> {
  return use(config) === "daemon" ? daemon.jump(config, index) : mpv.jump(config, index);
}

export function setVolume(config: MusicConfig, percent: number): Promise<number | null> {
  return use(config) === "daemon" ? daemon.setVolume(config, percent) : mpv.setVolume(config, percent);
}
