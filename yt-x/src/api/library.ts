import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CustomCommand, Entry, Playlist } from "~/types";
import { messageOf } from "~/utils/errors";
import { entriesOf, parseCustomCommands, parseEntries, parsePlaylists } from "~/utils/state";

type Library = {
  recent: Entry[];
  saved: Entry[];
  channels: Entry[];
  playlists: Playlist[];
};

type LibraryResult = {
  library: Library;
  /** Set when a state file exists but could not be read. */
  problem: string | null;
};

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** yt-x writes `{"entries": […]}` for some files and a bare array for others. */
function readEntries(path: string): unknown[] {
  const text = readText(path);
  if (text === undefined) return [];
  try {
    return entriesOf(JSON.parse(text));
  } catch (error) {
    throw new Error(`${path}: ${messageOf(error)}`);
  }
}

/** The current file wins; the flat file next to it is what older yt-x wrote. */
function readEither(current: string, legacy?: string): unknown[] {
  const text = readText(current) ?? (legacy === undefined ? undefined : readText(legacy));
  if (text === undefined) return [];
  try {
    return entriesOf(JSON.parse(text));
  } catch (error) {
    throw new Error(`${current}: ${messageOf(error)}`);
  }
}

/**
 * yt-x 0.8.7 reads only `my/*.json`. The flat files next to it are what older
 * versions wrote and what this machine still has, so they are read as a fallback
 * when the current file is absent — never written.
 */
export function readLibrary(configDir: string): LibraryResult {
  const my = join(configDir, "my");
  const problems: string[] = [];

  const group = <T>(label: string, current: string, legacy: string, parse: (text?: string) => T, fallback: T): T => {
    try {
      return parse(readText(current) ?? readText(legacy));
    } catch (error) {
      problems.push(`${label} (${current}): ${messageOf(error)}`);
      return fallback;
    }
  };

  const library: Library = {
    recent: group("Recent videos", join(my, "recents.json"), join(configDir, "recent.json"), parseEntries, []).reverse(),
    saved: group("Saved videos", join(my, "videos.json"), join(configDir, "saved-videos.json"), parseEntries, []).reverse(),
    channels: group(
      "Subscriptions",
      join(my, "subscriptions.json"),
      join(configDir, "subscriptions.json"),
      parseEntries,
      [],
    ),
    playlists: group(
      "Custom playlists",
      join(my, "playlists.json"),
      join(configDir, "custom-playlists.json"),
      parsePlaylists,
      [],
    ),
  };

  return { library, problem: problems.length > 0 ? problems.join("\n") : null };
}

/** yt-x appends to `my/videos.json`, newest last, without duplicates. */
export function saveVideo(video: Entry, configDir: string): void {
  const current = join(configDir, "my", "videos.json");
  const entries = readEither(current, join(configDir, "saved-videos.json")).filter((entry) => idOf(entry) !== video.id);
  entries.push(serialise(video));
  writeEntries(current, entries);
}

/** Remove from the current saved list and from the legacy one, if it is there. */
export function forgetVideo(id: string, configDir: string): void {
  for (const path of [join(configDir, "my", "videos.json"), join(configDir, "saved-videos.json")]) {
    if (readText(path) === undefined) continue;

    const entries = readEntries(path);
    const kept = entries.filter((entry) => idOf(entry) !== id);
    if (kept.length !== entries.length) writeEntries(path, kept);
  }
}

/** yt-x's "Save Playlist": append to `my/playlists.json`, keeping the list id. */
export function savePlaylist(playlist: { id?: string; name: string; url: string }, configDir: string): void {
  const current = join(configDir, "my", "playlists.json");
  const entries = readEither(current, join(configDir, "custom-playlists.json")).filter(
    (entry) => urlOf(entry) !== playlist.url,
  );
  const entry: Record<string, unknown> = { id: playlist.id ?? "", name: playlist.name, url: playlist.url };
  entries.push(entry);
  writeJson(current, entries);
}

export function forgetPlaylist(url: string, configDir: string): void {
  const id = playlistId(url);
  for (const path of [join(configDir, "my", "playlists.json"), join(configDir, "custom-playlists.json")]) {
    if (readText(path) === undefined) continue;

    const entries = readEntries(path);
    const kept = entries.filter((entry) => {
      const record = entry as { id?: unknown; url?: unknown } | null;
      return record?.url !== url && record?.id !== id;
    });
    if (kept.length !== entries.length) writeJson(path, kept);
  }
}

/** yt-x records a video in `my/recents.json` whenever the player starts. */
export function updateRecent(video: Entry, configDir: string, limit: number): void {
  const current = join(configDir, "my", "recents.json");
  const entries = readEither(current, join(configDir, "recent.json")).filter((entry) => idOf(entry) !== video.id);
  entries.push(serialise(video));
  writeEntries(current, entries.slice(-limit));
}

/** `search-history.txt` is one term per line, oldest first. */
export function readSearchHistory(cacheDir: string): string[] {
  const text = readText(join(cacheDir, "search-history.txt")) ?? "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * yt-x drops the term from the file and appends it again, then keeps the last
 * 100. A launcher searches while you type, so the growing prefixes of one
 * search replace each other instead of piling up.
 */
export function appendSearchHistory(term: string, cacheDir: string): void {
  const trimmed = term.trim();
  if (trimmed === "") return;

  const lines = readSearchHistory(cacheDir).filter((line) => line !== trimmed);
  const newest = lines[lines.length - 1];
  if (newest !== undefined && trimmed.startsWith(newest)) lines.pop();

  lines.push(trimmed);
  writeText(join(cacheDir, "search-history.txt"), `${lines.slice(-100).join("\n")}\n`);
}

export function clearSearchHistory(cacheDir: string): void {
  try {
    unlinkSync(join(cacheDir, "search-history.txt"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function readCustomCommands(configDir: string): CustomCommand[] {
  const text = readText(join(configDir, "my", "cmds.json"));
  return text === undefined ? [] : parseCustomCommands(text);
}

export function saveCustomCommand(command: CustomCommand, configDir: string): void {
  const path = join(configDir, "my", "cmds.json");
  const entries = readEntries(path).filter((entry) => (entry as { name?: unknown } | null)?.name !== command.name);
  entries.push({ name: command.name, url: command.url, "yt-dlp-opts": command.opts.join(" ") });
  writeJson(path, entries);
}

function idOf(entry: unknown): string | undefined {
  const id = (entry as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : undefined;
}

function urlOf(entry: unknown): string | undefined {
  const url = (entry as { url?: unknown } | null)?.url;
  return typeof url === "string" ? url : undefined;
}

function playlistId(url: string): string {
  try {
    return new URL(url).searchParams.get("list") ?? url;
  } catch {
    return url;
  }
}

function serialise(video: Entry): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    _type: "url",
    id: video.id,
    title: video.title,
    url: video.url,
  };
  if (video.channel) entry.channel = video.channel;
  if (typeof video.duration === "number") entry.duration = video.duration;
  if (video.thumbnails) entry.thumbnails = video.thumbnails;
  if (video.channelUrl) entry.channel_url = video.channelUrl;
  if (video.channelId) entry.channel_id = video.channelId;
  if (typeof video.viewCount === "number") entry.view_count = video.viewCount;
  if (typeof video.concurrentViewCount === "number") entry.concurrent_view_count = video.concurrentViewCount;
  if (video.liveStatus) entry.live_status = video.liveStatus;
  if (typeof video.publishedAt === "number") entry.timestamp = video.publishedAt;
  return entry;
}

function writeEntries(path: string, entries: unknown[]): void {
  writeJson(path, { entries });
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  // yt-x may be reading this file at any moment; a rename is atomic.
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temp, path);
}

function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}
