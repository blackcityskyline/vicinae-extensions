import { createHash } from "node:crypto";

import { youtubeCookies } from "~/api/cookies";
import type { Config, Entry } from "~/types";
import { sapisidOf } from "~/utils/cookies";
import { parseRelated } from "~/utils/related";

/**
 * The related column is not a yt-dlp listing: yt-dlp answers one video, not its neighbours.
 * YouTube's own watch-next endpoint does, and it needs the innertube client its watch page
 * carries — a public key and a version, both read from that page and remembered for as long as
 * the worker lives.
 *
 * A signed-out reply is a generic list, so the request carries the browser's youtube.com
 * cookies when there are any, signed the way Google's own web client signs them.
 */

const WATCH = "https://www.youtube.com/watch?v=";
const NEXT = "https://www.youtube.com/youtubei/v1/next";
const ORIGIN = "https://www.youtube.com";
const TIMEOUT_MS = 15_000;

const HEADERS = {
  accept: "text/html,application/json",
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

type Client = { key: string; version: string };

let client: Client | undefined;

async function innertube(videoId: string): Promise<Client> {
  if (client) return client;

  const response = await fetch(`${WATCH}${encodeURIComponent(videoId)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`YouTube answered ${response.status} for the watch page`);
  }

  const html = await response.text();
  const key = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
  const version = /"clientVersion":"([^"]+)"/.exec(html)?.[1];
  if (!key || !version) {
    throw new Error("YouTube's watch page carried no innertube client");
  }

  client = { key, version };
  return client;
}

/** The browser's cookies, read once per worker; no cookies means the guest list. */
let cookies: Promise<string> | undefined;

function signedHeaders(config: Config): Promise<Record<string, string>> {
  cookies ??= youtubeCookies(config).catch(() => "");
  return cookies.then((cookie) => {
    if (cookie === "") return { ...HEADERS, "content-type": "application/json" };

    const headers = { ...HEADERS, "content-type": "application/json", cookie };
    const sapisid = sapisidOf(cookie);
    if (sapisid === undefined) return headers;

    // what youtube.com sends for a signed-in tab: sha1 of the time, the cookie and the origin
    const stamp = Math.floor(Date.now() / 1000);
    const digest = createHash("sha1").update(`${stamp} ${sapisid} ${ORIGIN}`).digest("hex");
    return { ...headers, authorization: `SAPISIDHASH ${stamp}_${digest}` };
  });
}

export async function relatedVideos(videoId: string, config: Config): Promise<Entry[]> {
  const [{ key, version }, headers] = await Promise.all([innertube(videoId), signedHeaders(config)]);

  const response = await fetch(`${NEXT}?key=${encodeURIComponent(key)}&prettyPrint=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: version, hl: "en", gl: "US" } },
      videoId,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`YouTube answered ${response.status} for the related videos`);
  }

  return parseRelated(await response.json());
}
