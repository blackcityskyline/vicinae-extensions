/**
 * How a translation request is put on the wire.
 *
 * Everything here is measured, not assumed. The endpoint answers 200 from this
 * machine, takes no key and no token, and refuses a url longer than 2048
 * characters. See `docs/audits/translate.md`.
 */

export const ENDPOINT = "https://translate.google.com/translate_a/single";

/**
 * Everything beyond the translation itself.
 *
 * Measured on `q=hello`: `t` alone fills only the translation and the detected
 * language, `t,bd` adds the dictionary, `t,at` adds the examples, `md` adds the
 * definitions. Asking for fewer still answers 200, just shorter — so nothing
 * downstream would ever report what was left out.
 */
const DATA_TYPES = ["at", "bd", "ex", "ld", "md", "qca", "rw", "rm", "ss", "t"] as const;

/** Measured: 2700 characters in a POST body translate fine; the url cannot pass this. */
export const POST_THRESHOLD = 2048;

export type TranslateRequest = {
  url: string;
  method: "GET" | "POST";
  /** Only on POST: the text, urlencoded. */
  body?: string;
};

export function translateRequest(text: string, from: string, to: string): TranslateRequest {
  const query = new URLSearchParams({
    client: "dict-chrome-ex",
    sl: from,
    tl: to,
    ie: "UTF-8",
    oe: "UTF-8",
    otf: "1",
    kc: "7",
  });
  for (const type of DATA_TYPES) query.append("dt", type);

  const bare = `${ENDPOINT}?${query}`;

  // Built by encoding, never by concatenation: an "&" in the text must not become
  // another parameter, and a "#" must not cut the url short.
  const withText = `${bare}&q=${encodeURIComponent(text)}`;
  if (withText.length <= POST_THRESHOLD) return { url: withText, method: "GET" };

  return { url: bare, method: "POST", body: new URLSearchParams({ q: text }).toString() };
}