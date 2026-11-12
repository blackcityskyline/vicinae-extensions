import type { Config, Entry } from "~/types";

import { entriesOf, toEntry } from "./state";

export type Listing = {
  /** First entry of the page, as yt-x's `--playlist-start`. */
  start?: number;
  /** Last entry of the page, as yt-x's `--playlist-end`. */
  end?: number;
  /** A custom command's own yt-dlp options, appended last. */
  extraOpts?: string[];
};

/**
 * The yt-dlp invocation yt-x uses for every listing. yt-x's config options come
 * before its own flags, and the tab extractor gets the same date argument.
 */
export function listArgs(target: string, config: Config, listing: Listing = {}): string[] {
  const args: string[] = [];

  if (config.cookiesBrowser) args.push("--cookies-from-browser", config.cookiesBrowser);
  args.push(...config.ytDlpOpts);
  args.push(
    "--dump-single-json",
    "--flat-playlist",
    "--playlist-start",
    String(listing.start ?? 1),
    "--playlist-end",
    String(listing.end ?? config.perPage),
    "--extractor-args",
    "youtubetab:approximate_date",
  );
  args.push(...(listing.extraOpts ?? []), target);

  return args;
}

export type ParsedListing = {
  /** The page's own title, which yt-x uses as the playlist name and download folder. */
  title?: string;
  entries: Entry[];
};

/** Parse one `--dump-single-json` page: its title and its rows. */
export function parseListing(stdout: string): ParsedListing {
  const data = JSON.parse(stdout) as unknown;
  const entries = entriesOf(data).flatMap((entry) => {
    const parsed = toEntry(entry);
    return parsed ? [parsed] : [];
  });

  const record = typeof data === "object" && data !== null ? (data as { title?: unknown }) : null;
  const title = typeof record?.title === "string" && record.title.length > 0 ? record.title : undefined;

  return { title, entries };
}

/**
 * The top of a channel listing, which yt-dlp fills with the channel's own name,
 * avatar, subscriber count and description instead of putting them on a row.
 */
export function parseChannelInfo(stdout: string): Entry | null {
  const data = JSON.parse(stdout) as unknown;
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;
  const url = record.channel_url ?? record.uploader_url ?? record.original_url;

  return toEntry({
    id: record.channel_id ?? url,
    title: record.channel ?? record.uploader ?? record.title,
    url,
    channel: record.channel ?? record.uploader,
    channel_id: record.channel_id,
    channel_follower_count: record.channel_follower_count,
    description: record.description,
    thumbnails: record.thumbnails,
  });
}
