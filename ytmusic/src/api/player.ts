import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { splitWords } from "~/utils/shell-words";

import { playUrl } from "~/api/mpv";

export type MusicConfig = {
  player: string;
  playerArgs: string[];
  /** mpv opens its own window instead of playing headless. */
  window: boolean;
  downloadDir: string;
  /** `$XDG_CACHE_HOME/ytmusic`, for the local play history. */
  cacheDir: string;
};

/** `~/Music` means the same folder here as it does in a shell. */
export function expandHome(path: string, home: string = homedir()): string {
  for (const prefix of ["${HOME}/", "$HOME/", "~/"]) {
    if (path.startsWith(prefix)) return `${home}/${path.slice(prefix.length)}`;
  }
  for (const exact of ["${HOME}", "$HOME", "~"]) {
    if (path === exact) return home;
  }
  return path;
}

/** The preferences, with the same defaults the manifest shows. */
export function buildMusicConfig(
  values: { player?: string; playerArgs?: string; playerWindow?: boolean; downloadDir?: string },
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): MusicConfig {
  const downloadDir = (values.downloadDir ?? "").trim() || "~/Music/YouTube Music";
  const cacheHome = env.XDG_CACHE_HOME || `${home}/.cache`;

  return {
    player: (values.player ?? "").trim() || "mpv",
    playerArgs: splitWords(values.playerArgs ?? ""),
    window: values.playerWindow === true,
    downloadDir: expandHome(downloadDir, home),
    cacheDir: `${cacheHome}/ytmusic`,
  };
}

export function playArgs(url: string, config: MusicConfig): string[] {
  return [url, ...config.playerArgs];
}

/** A single song: the audio track only, in a folder named after the artist. */
export function downloadArgs(url: string, config: MusicConfig): string[] {
  return [
    url,
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--output",
    join(config.downloadDir, "%(artist,creator,uploader)s", "%(title)s.%(ext)s"),
  ];
}

/** A slash in a title would turn the folder name into a path. */
function safeName(name: string): string {
  return name.replace(/[/\\]/g, "_").trim() || "Playlist";
}

/** An album or playlist: one folder, tracks numbered in the order of the page. */
export function playlistDownloadArgs(url: string, title: string, config: MusicConfig): string[] {
  return [
    url,
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--output",
    join(config.downloadDir, safeName(title), "%(playlist_index)s - %(title)s.%(ext)s"),
  ];
}

/** Start the player detached: the worker exits, the music keeps playing. */
export function play(url: string, config: MusicConfig): Promise<void> {
  if (config.player === "mpv") return playUrl(url, config);
  return spawnDetached(config.player, playArgs(url, config));
}

export function downloadAudio(url: string, config: MusicConfig): Promise<void> {
  return spawnDetached("yt-dlp", downloadArgs(url, config));
}

export function downloadPlaylistAudio(url: string, title: string, config: MusicConfig): Promise<void> {
  return spawnDetached("yt-dlp", playlistDownloadArgs(url, title, config));
}

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
