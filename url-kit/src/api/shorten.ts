import { looksLikeUrl, readShortLink, withScheme } from "~/utils/url";

const ENDPOINT = "https://tinyurl.com/api-create.php?url=";

/**
 * Shortens a link through TinyURL's keyless endpoint.
 *
 * It is the only backend: v.gd answered "Error, database insert failed" for 12 of 12
 * links it had not seen before, and returns a working link only for a URL already in
 * its cache, which is what made a single spot check look like success.
 */
export async function shorten(url: string): Promise<string> {
  // Only the clipboard's contents leave the machine here, so what may be sent is decided
  // before anything is sent.
  if (!looksLikeUrl(url)) {
    throw new Error("Only a URL is sent to TinyURL, and this text is not one.");
  }

  const response = await fetch(ENDPOINT + encodeURIComponent(withScheme(url)));
  const link = readShortLink(await response.text());

  if (!link) {
    throw new Error(`TinyURL refused the link (HTTP ${response.status}).`);
  }

  return link;
}
