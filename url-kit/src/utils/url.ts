/**
 * Percent-encoding rules, kept apart from the clipboard and network code so they
 * can be checked without either.
 */

/** Thrown with a message meant for the user rather than for a stack trace. */
const MALFORMED = "The clipboard does not hold valid percent-encoding: a % is not followed by two hex digits.";

function decode(value: string, plusIsSpace: boolean): string {
  const prepared = plusIsSpace ? value.replace(/\+/g, " ") : value;
  try {
    return decodeURIComponent(prepared);
  } catch {
    throw new Error(MALFORMED);
  }
}

/**
 * Decodes a URL, treating `+` as a space inside the query string and as a
 * literal plus everywhere else.
 *
 * `decodeURIComponent` alone gets this wrong in both directions: it leaves `+`
 * alone in a query, where every web server reads it as a space, and it has no
 * idea which `+` it was handed.
 */
export function decodeUrl(value: string): string {
  const hash = value.indexOf("#");
  const head = hash === -1 ? value : value.slice(0, hash);
  const fragment = hash === -1 ? "" : `#${decode(value.slice(hash + 1), false)}`;

  const mark = head.indexOf("?");
  if (mark === -1) return `${decode(head, false)}${fragment}`;

  const query = head
    .slice(mark + 1)
    .split("&")
    .map((pair) => decode(pair, true))
    .join("&");

  return `${decode(head.slice(0, mark), false)}?${query}${fragment}`;
}

const WITH_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#]|$)/;

/** Adds the scheme TinyURL requires: it answers 400 for a bare domain with a path. */
export function withScheme(value: string): string {
  const text = value.trim();
  return WITH_SCHEME.test(text) ? text : `https://${text}`;
}

/**
 * Whether the clipboard holds something worth sending to a shortener.
 *
 * Only the clipboard's contents leave the machine here, so this decides what
 * does. A name without a scheme cannot be told apart from a filename, and
 * refusing those would also refuse every pasted `example.com`.
 */
export function looksLikeUrl(value: string): boolean {
  const text = value.trim();
  return WITH_SCHEME.test(text) || BARE_DOMAIN.test(text);
}

/**
 * TinyURL answers with the bare short URL, but answers 400 with `Error` and an
 * intercepted request with a whole HTML page, so the shape is checked rather
 * than assumed.
 */
export function readShortLink(body: string): string | null {
  const text = body.trim();
  return /^https:\/\/tinyurl\.com\/[\w-]+$/.test(text) ? text : null;
}
