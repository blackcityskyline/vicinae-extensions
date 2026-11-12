import { youtubeCookies } from "~/api/cookies";
import type { Config } from "~/types";
import { authHeaders } from "~/utils/cookies";

/**
 * YouTube's own innertube client, which the watch page carries: a public key and a version.
 * Both are read from the page once per worker, and every call here goes through them — the
 * related column and the comments are the same endpoint with a different body.
 *
 * A signed-out reply is a generic one, so the request carries the browser's youtube.com
 * cookies when there are any, signed the way Google's own web client signs them.
 */

const WATCH = "https://www.youtube.com/watch?v=";
const API = "https://www.youtube.com/youtubei/v1";
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

/** The browser's cookies, read once per worker; no cookies means the guest reply. */
let cookies: Promise<string> | undefined;

function browserHeaders(config: Config): Promise<Record<string, string>> {
  cookies ??= youtubeCookies(config).catch(() => "");
  return cookies.then((cookie) => ({
    ...HEADERS,
    "content-type": "application/json",
    ...authHeaders(cookie, Math.floor(Date.now() / 1000)),
  }));
}

export type NextPayload = {
  /** The page the client is scraped from; a continuation call still needs it. */
  videoId: string;
  /** The token a previous reply handed out, for the comments and their replies. */
  continuation?: string;
};

/**
 * One POST to the innertube client. `what` names the thing in the error, because the endpoint
 * answers several views, and `videoId` only says which page the key was scraped from.
 */
export async function innertubePost(
  path: string,
  videoId: string,
  payload: Record<string, unknown>,
  config: Config,
  what: string,
): Promise<unknown> {
  const [{ key, version }, headers] = await Promise.all([innertube(videoId), browserHeaders(config)]);

  const response = await fetch(`${API}/${path}?key=${encodeURIComponent(key)}&prettyPrint=false`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: version, hl: "en", gl: "US" } },
      ...payload,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`YouTube answered ${response.status} for ${what}`);
  }

  return response.json();
}

/** The watch-next call: one video and its neighbours, or the next page of a token. */
export async function nextReply(payload: NextPayload, config: Config, what: string): Promise<unknown> {
  const body =
    payload.continuation === undefined ? { videoId: payload.videoId } : { continuation: payload.continuation };
  return innertubePost("next", payload.videoId, body, config, what);
}
