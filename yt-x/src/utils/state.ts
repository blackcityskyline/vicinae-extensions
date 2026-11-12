import type { CustomCommand, Entry, Playlist, Thumbnail } from "~/types";

import { splitWords } from "./shell-words";

type Record_ = Record<string, unknown>;

function asRecord(value: unknown): Record_ | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record_) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

function asThumbnails(value: unknown): Thumbnail[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const thumbnails: Thumbnail[] = [];
  for (const item of value) {
    const entry = asRecord(item);
    const url = asString(entry?.url);
    if (!url) continue;
    const thumbnail: Thumbnail = { url: normalizeUrl(url) };
    if (typeof entry?.width === "number") thumbnail.width = entry.width;
    if (typeof entry?.height === "number") thumbnail.height = entry.height;
    thumbnails.push(thumbnail);
  }

  return thumbnails.length > 0 ? thumbnails : undefined;
}

/** yt-x previews the last thumbnail yt-dlp listed, which is the largest one. */
export function thumbnailUrl(entry: { thumbnails?: Thumbnail[] }): string | undefined {
  return entry.thumbnails?.[entry.thumbnails.length - 1]?.url;
}

/** One entry of a yt-dlp listing or a yt-x state file. */
export function toEntry(value: unknown): Entry | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id);
  const title = asString(record.title) ?? asString(record.channel) ?? asString(record.uploader);
  const url = asString(record.url) ?? asString(record.webpage_url) ?? asString(record.channel_url);
  if (!id || !title || !url || !/^https?:\/\//.test(url)) return null;

  const entry: Entry = { id, title, url };
  const channel = asString(record.channel) ?? asString(record.uploader);
  if (channel) entry.channel = channel;
  if (typeof record.duration === "number" && Number.isFinite(record.duration)) entry.duration = record.duration;
  const channelUrl = asString(record.channel_url) ?? asString(record.uploader_url);
  if (channelUrl) entry.channelUrl = normalizeUrl(channelUrl);
  const channelId = asString(record.channel_id);
  if (channelId) entry.channelId = channelId;
  if (typeof record.view_count === "number" && Number.isFinite(record.view_count)) entry.viewCount = record.view_count;
  if (typeof record.concurrent_view_count === "number" && Number.isFinite(record.concurrent_view_count)) {
    entry.concurrentViewCount = record.concurrent_view_count;
  }
  const liveStatus = asString(record.live_status);
  if (liveStatus) entry.liveStatus = liveStatus;
  const publishedAt = typeof record.timestamp === "number" ? record.timestamp : record.release_timestamp;
  if (typeof publishedAt === "number" && Number.isFinite(publishedAt)) entry.publishedAt = publishedAt;
  if (typeof record.channel_follower_count === "number" && Number.isFinite(record.channel_follower_count)) {
    entry.followerCount = record.channel_follower_count;
  }
  const description = asString(record.description);
  if (description) entry.description = description;
  const thumbnails = asThumbnails(record.thumbnails);
  if (thumbnails) entry.thumbnails = thumbnails;
  return entry;
}

/** yt-x writes `{"entries": […]}` for videos and channels, and a bare array for playlists. */
export function entriesOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const entries = asRecord(value)?.entries;
  return Array.isArray(entries) ? entries : [];
}

function entriesFrom(text: string | undefined): unknown[] {
  return text && text.trim() !== "" ? entriesOf(JSON.parse(text)) : [];
}

export function parseEntries(text: string | undefined): Entry[] {
  return entriesFrom(text).flatMap((entry) => {
    const parsed = toEntry(entry);
    return parsed ? [parsed] : [];
  });
}

export function parsePlaylists(text: string | undefined): Playlist[] {
  return entriesFrom(text).flatMap((entry) => {
    const record = asRecord(entry);
    const name = asString(record?.name);
    const url = asString(record?.url);
    return name && url && /^https?:\/\//.test(url) ? [{ name, url }] : [];
  });
}

/** `my/cmds.json` is an array of `{name, url, "yt-dlp-opts"}`. */
export function parseCustomCommands(text: string | undefined): CustomCommand[] {
  return entriesFrom(text).flatMap((entry) => {
    const record = asRecord(entry);
    const name = asString(record?.name);
    const url = asString(record?.url);
    if (!name || !url) return [];
    const opts = asString(record?.["yt-dlp-opts"]) ?? "";
    return [{ name, url, opts: opts.trim() === "" ? [] : splitWords(opts) }];
  });
}

/** `7325` becomes `2:02:05`; a live stream has no duration and gets none. */
export function formatDuration(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return undefined;

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** `20949` becomes `20.9K`; the detail pane has room for one decimal. */
export function formatCount(count: number | null | undefined): string | undefined {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return undefined;

  const units = [
    { size: 1_000_000_000, suffix: "B" },
    { size: 1_000_000, suffix: "M" },
    { size: 1_000, suffix: "K" },
  ];
  for (const unit of units) {
    if (count < unit.size) continue;
    const scaled = count / unit.size;
    const rounded = scaled >= 100 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, "");
    return `${rounded}${unit.suffix}`;
  }

  return String(Math.round(count));
}

/** A yt-dlp timestamp becomes `Jan 1, 2025`, in UTC as YouTube reports it. */
export function formatPublished(seconds: number | null | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(seconds * 1000));
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** yt-x opens a channel tab by appending its name to the channel URL. */
export function channelTabUrl(channelUrl: string, tab: string): string {
  return `${channelUrl.replace(/\/+$/, "")}/${tab}`;
}

export function channelSearchUrl(channelUrl: string, query: string): string {
  return `${channelTabUrl(channelUrl, "search")}?query=${encodeURIComponent(query)}`;
}

/** The channel page can be rebuilt from a flat listing entry without a request. */
export function channelUrlOf(entry: Entry): string | undefined {
  if (entry.channelUrl) return entry.channelUrl;
  if (entry.channelId) return `https://www.youtube.com/channel/${entry.channelId}`;
  return undefined;
}

/** yt-x's Mix action: the video's auto-generated radio playlist. */
export function mixUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
}

/** The saved-playlist files are keyed by the `list=` part of the URL. */
export function playlistIdOf(url: string): string {
  try {
    return new URL(url).searchParams.get("list") ?? url;
  } catch {
    return url;
  }
}
