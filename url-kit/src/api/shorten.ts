import { looksLikeUrl, readShortLink, withScheme } from "~/utils/url";

const ENDPOINT = "https://tinyurl.com/api-create.php?url=";

/**
 * Shortens a link through TinyURL's keyless endpoint — the only one of the four
 * services the upstream extension advertised that still answers. v.gd returned
 * `Error, database insert failed` on eight of eight attempts, 9qr.de answered 403
 * and shiny.link timed out.
 */
export async function shorten(url: string): Promise<string> {
  if (!looksLikeUrl(url)) {
    throw new Error("Only a URL is sent to TinyURL, and the clipboard holds something else.");
  }

  const response = await fetch(ENDPOINT + encodeURIComponent(withScheme(url)));
  const link = readShortLink(await response.text());

  if (!link) {
    throw new Error(`TinyURL refused the link (HTTP ${response.status}).`);
  }
  return link;
}
