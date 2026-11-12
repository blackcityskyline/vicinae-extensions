/**
 * The related column is the browser's own: only a signed-in request shows the personal one,
 * and the cookies have to come from the browser the user is signed in to. yt-x names that
 * browser in `CONFIG_BROWSER`, or, as on this machine, the global `yt-dlp` config does.
 *
 * yt-dlp cannot serve this: its Firefox reader passes `expiry=0` to the cookie jar, which
 * drops session cookies — and a signed-in YouTube tab keeps `SID` and `SAPISID` as session
 * cookies. So the database is read here, read-only, and never written anywhere.
 */

import { splitWords } from "~/utils/shell-words";

export type BrowserSpec = {
  /** Lowercase: `firefox`, `brave`, `chromium`, `zen`. */
  browser: string;
  /** The profile directory from `browser:/path`, `~` still in it. */
  profile?: string;
};

export type CookieRow = { name: string; value: string };

/** `firefox:~/.config/zen/x`, `firefox+gnomekeyring:profile::container`, `brave`. */
export function parseBrowserSpec(text: string): BrowserSpec | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const colon = trimmed.indexOf(":");
  const browser = (colon === -1 ? trimmed : trimmed.slice(0, colon)).split("+")[0]?.trim().toLowerCase() ?? "";
  if (!/^[a-z]+$/.test(browser)) return null;

  const profile = colon === -1 ? "" : (trimmed.slice(colon + 1).split("::")[0] ?? "").trim();
  const unquoted = profile.replace(/^(['"])(.*)\1$/, "$2");
  return { browser, ...(unquoted === "" ? {} : { profile: unquoted }) };
}

/**
 * The browser a `yt-dlp` config names: downloads already use those cookies. The config is
 * shell-split, because a profile path with a space arrives as `'a b'`.
 */
export function cookieBrowserLine(config: string): string | undefined {
  const flag = "--cookies-from-browser";
  for (const line of config.split("\n")) {
    if (line.trimStart().startsWith("#")) continue;
    const words = splitWords(line);
    for (const [index, word] of words.entries()) {
      if (word === flag) return words[index + 1];
      if (word.startsWith(`${flag}=`)) return word.slice(flag.length + 1);
    }
  }
  return undefined;
}

/** Browsers keep several cookies under one name; the one written last is the one sent. */
export function cookieHeader(rows: CookieRow[]): string {
  const values = new Map<string, string>();
  for (const row of rows) if (row.name !== "") values.set(row.name, row.value);
  return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** `SAPISID` is what Google's own `Authorization: SAPISIDHASH` header signs. */
export function sapisidOf(header: string): string | undefined {
  return /(?:^|;\s*)SAPISID=([^;]*)/.exec(header)?.[1];
}

/** `sqlite3` prints one `name<TAB>value` pair per line; a value may hold `=` and `|`. */
export function parseCookieRows(output: string): CookieRow[] {
  return output.split("\n").flatMap((line) => {
    const tab = line.indexOf("\t");
    return tab === -1 ? [] : [{ name: line.slice(0, tab), value: line.slice(tab + 1) }];
  });
}
