import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Config, Entry } from "~/types";
import { playlistText } from "~/utils/upnext";

export type DownloadKind = "video" | "audio";

/** What yt-x runs when mpv is the player, including its listen flags. */
export function playArgs(url: string, listen: boolean, config: Config): string[] {
  const args = [url, ...config.playerArgs];
  if (listen) args.push("--no-video", "--force-window=no");
  return args;
}

function kindArgs(kind: DownloadKind): string[] {
  return kind === "audio" ? ["--extract-audio", "--audio-format", "mp3"] : [];
}

/** The single-video command and folder layout of yt-x's own download action. */
export function downloadArgs(url: string, kind: DownloadKind, config: Config): string[] {
  const output = join(config.downloadDir, kind, "individual", "%(channel)s", "%(title)s.%(ext)s");
  const args = [url];

  if (config.cookiesBrowser) args.push("--cookies-from-browser", config.cookiesBrowser);
  args.push(...kindArgs(kind), "--output", output);

  return args;
}

/** yt-x hashes `<kind> - <url>` to name the download archive of one playlist. */
export function archivePath(url: string, kind: DownloadKind, config: Config): string {
  const name = createHash("sha256").update(`${kind} - ${url}`).digest("hex");
  return join(config.cacheDir, "archives", name);
}

/** yt-x's "Download All": a folder named after the playlist, plus an archive. */
export function playlistDownloadArgs(url: string, title: string, kind: DownloadKind, config: Config): string[] {
  const prefix = config.enumerateDownloads ? "%(playlist_index)s - " : "";
  const output = join(config.downloadDir, kind, title, "%(channel)s", `${prefix}%(title)s.%(ext)s`);
  const args = [url];

  if (config.cookiesBrowser) args.push("--cookies-from-browser", config.cookiesBrowser);
  args.push(...kindArgs(kind), "--output", output, "--download-archive", archivePath(url, kind, config));

  return args;
}

/** Start the player detached: the worker exits, the video keeps playing. */
export function play(url: string, listen: boolean, config: Config): Promise<void> {
  return spawnDetached(config.player, playArgs(url, listen, config));
}

/** One m3u and one player: the player advances by itself, and stops at the end of the list. */
export function playPlaylist(entries: Entry[], config: Config): Promise<void> {
  const path = join(config.cacheDir, "up-next", `${entries[0]?.id ?? "list"}.m3u`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, playlistText(entries));
  return spawnDetached(config.player, [path, ...config.playerArgs]);
}

export function download(url: string, kind: DownloadKind, config: Config): Promise<void> {
  return spawnDetached("yt-dlp", downloadArgs(url, kind, config));
}

export function downloadPlaylist(url: string, title: string, kind: DownloadKind, config: Config): Promise<void> {
  mkdirSync(dirname(archivePath(url, kind, config)), { recursive: true });
  return spawnDetached("yt-dlp", playlistDownloadArgs(url, title, kind, config));
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
