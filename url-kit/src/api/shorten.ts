import { looksLikeUrl, readShortLink, withScheme } from "~/utils/url";

const ENDPOINT = "https://tinyurl.com/api-create.php?url=";

/**
 * Shortens a link through TinyURL's keyless endpoint.
 *
 * Upstream offered a `domain` dropdown with the values "4" and "5", behind two
 * backends. It is gone here because the second one does not work. Measured, twelve
 * requests each, on links TinyURL and v.gd had never been asked about:
 *
 *   tinyurl.com/api-create.php      12 of 12
 *   v.gd/create.php?format=simple   0 of 12 — "Error, database insert failed"
 *
 * v.gd answers HTTP 200 and hands back a working link only for a URL already in its
 * cache; asked the same URL twelve times it answered twelve times. A single spot check
 * on a cached URL is what made it look alive, and that is the measurement that had been
 * recorded here before and was wrong. A dropdown offering a backend that fails on every
 * new link is worse than no dropdown.
 *
 * The other two domains upstream's description advertised were never implemented: shrtco.de
 * and 9qr.de serve an HTML page on their API paths, shiny.link does not answer.
 */
export async function shorten(url: string): Promise<string> {
  // Only the clipboard's contents leave the machine here, so what may be sent is decided
  // before anything is sent.
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
