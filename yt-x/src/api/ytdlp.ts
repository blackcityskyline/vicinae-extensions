import { execFile } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Config, Entry } from "~/types";
import { channelTabUrl } from "~/utils/state";
import { parseChannelInfo, parseListing, listArgs, type Listing, type ParsedListing } from "~/utils/ytdlp";

const run = promisify(execFile);

const EXEC = { maxBuffer: 64 * 1024 * 1024, timeout: 300_000 };

export async function fetchEntries(target: string, config: Config, listing: Listing = {}): Promise<ParsedListing> {
  try {
    const { stdout } = await run("yt-dlp", listArgs(target, config, listing), EXEC);
    return parseListing(stdout);
  } catch (error) {
    throw ytDlpFailure(error);
  }
}

/** yt-x's "Go To Channel" asks yt-dlp when the listing had no channel URL. */
export async function fetchChannelUrl(videoUrl: string, config: Config): Promise<string> {
  const args = ["--print", "channel_url", "--no-warnings"];
  if (config.cookiesBrowser) args.push("--cookies-from-browser", config.cookiesBrowser);
  args.push(...config.ytDlpOpts, videoUrl);

  try {
    const { stdout } = await run("yt-dlp", args, EXEC);
    const url = stdout.trim().split("\n").pop()?.trim() ?? "";
    if (!/^https?:\/\//.test(url)) throw new Error("yt-dlp did not report a channel for this video.");
    return url;
  } catch (error) {
    throw ytDlpFailure(error);
  }
}

/**
 * The channel page's own header. One entry is enough: the avatar, subscriber
 * count and description sit at the top level of the listing, not on a row.
 */
export async function fetchChannelInfo(channelUrl: string, config: Config): Promise<Entry | null> {
  try {
    const { stdout } = await run(
      "yt-dlp",
      listArgs(channelTabUrl(channelUrl, "videos"), config, { start: 1, end: 1 }),
      EXEC,
    );
    return parseChannelInfo(stdout);
  } catch (error) {
    throw ytDlpFailure(error);
  }
}

/**
 * yt-x's "Sync YouTube Subscriptions": replace `my/subscriptions.json` with
 * whatever `https://www.youtube.com/feed/channels` returns.
 */
export async function syncSubscriptions(config: Config): Promise<number> {
  const args: string[] = [];
  if (config.cookiesBrowser) args.push("--cookies-from-browser", config.cookiesBrowser);
  args.push("--flat-playlist", "--dump-single-json", "https://www.youtube.com/feed/channels");

  let stdout: string;
  try {
    ({ stdout } = await run("yt-dlp", args, EXEC));
  } catch (error) {
    throw ytDlpFailure(error);
  }

  const entries = parseListing(stdout).entries;
  if (entries.length === 0) throw new Error("YouTube returned no subscriptions.");

  const path = join(config.configDir, "my", "subscriptions.json");
  mkdirSync(join(config.configDir, "my"), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, stdout);
  renameSync(temp, path);
  return entries.length;
}

/** Turn a yt-dlp failure into something a person can act on. */
function ytDlpFailure(error: unknown): Error {
  const failure = error as NodeJS.ErrnoException & { stderr?: string };
  if (failure.code === "ENOENT") return new Error("yt-dlp is not installed or not in PATH.");

  const reported = (failure.stderr ?? "")
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("ERROR:"));

  return new Error(reported ?? failure.message);
}
