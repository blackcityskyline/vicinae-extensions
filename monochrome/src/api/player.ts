import { spawn } from "node:child_process";
import { homedir } from "node:os";

import { playUrl } from "~/api/mpv";
import { splitWords } from "~/utils/shell-words";
import { streamUrl } from "~/utils/monochrome";

export type MusicConfig = {
  player: string;
  playerArgs: string[];
  /** mpv opens its own window instead of playing headless. */
  window: boolean;
  /** Where `Download` writes its FLAC files. */
  downloadDir: string;
  /** PodcastIndex key and secret; their API refuses everything without the pair. */
  podcastKey: string;
  podcastSecret: string;
  /** `$XDG_CACHE_HOME/monochrome`, for the queue's titles and covers. */
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
export function buildConfig(
  values: {
    player?: string;
    playerArgs?: string;
    playerWindow?: boolean;
    downloadDir?: string;
    podcastKey?: string;
    podcastSecret?: string;
  },
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): MusicConfig {
  const cacheHome = env.XDG_CACHE_HOME || `${home}/.cache`;
  const downloadDir = (values.downloadDir ?? "").trim() || "~/Music/Monochrome";

  return {
    player: (values.player ?? "").trim() || "mpv",
    playerArgs: splitWords(values.playerArgs ?? ""),
    window: values.playerWindow === true,
    downloadDir: expandHome(downloadDir, home),
    podcastKey: (values.podcastKey ?? "").trim(),
    podcastSecret: (values.podcastSecret ?? "").trim(),
    cacheDir: `${cacheHome}/monochrome`,
  };
}

/** Start the player detached: the worker exits, the music keeps playing. */
export function play(trackId: string, config: MusicConfig): Promise<void> {
  const url = streamUrl(trackId);
  if (config.player === "mpv") return playUrl(url, config);
  return spawnDetached(config.player, [url, ...config.playerArgs]);
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
