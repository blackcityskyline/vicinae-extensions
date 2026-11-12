import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { browserCookies } from "~/api/browser";
import { expandHome } from "~/api/player";

export const MUSIC_ORIGIN = "https://music.youtube.com";

/** The cookies that tell a signed-in header from a guest one. */
const PROOF = ["SAPISID", "__Secure-3PAPISID"];

export type Auth = {
  /** The normalised `Cookie` header. Never logged. */
  cookies: string;
  sapisid: string;
  authUser: number;
};

export type AuthSettings = {
  cookies?: string;
  cookiesFile?: string;
  authUser?: string;
};

export type AuthResult = {
  auth: Auth | null;
  /** Why the configured cookies were refused; absent when there were none. */
  problem: string | null;
};

/** `name=value` pairs only, as Sonora's own sign-in normalises them. */
export function cookieHeader(input: string): string | null {
  const pairs = input
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair.includes("=") && !/\s/.test(pair));
  const signedIn = pairs.some((pair) => PROOF.includes(pair.split("=")[0] ?? ""));
  return signedIn ? pairs.join("; ") : null;
}

function sapisidOf(header: string): string | undefined {
  for (const name of PROOF) {
    const prefix = `${name}=`;
    const pair = header.split("; ").find((found) => found.startsWith(prefix));
    if (pair) return pair.slice(prefix.length);
  }

  return undefined;
}

export function parseAuth(cookies: string, authUser = "0"): Auth | null {
  const header = cookieHeader(cookies);
  if (!header) return null;
  const sapisid = sapisidOf(header);
  if (!sapisid) return null;

  const parsed = Number.parseInt(authUser, 10);
  return {
    cookies: header,
    sapisid,
    authUser: Number.isInteger(parsed) && parsed >= 0 ? parsed : 0,
  };
}

/** `SAPISIDHASH`, as Google signs a web request: sha1 over the time, the cookie and the origin. */
export function sidHash(timestamp: number, sapisid: string, origin: string = MUSIC_ORIGIN): string {
  const digest = createHash("sha1").update(`${timestamp} ${sapisid} ${origin}`).digest("hex");
  return `${timestamp}_${digest}`;
}

export function authorization(auth: Auth, timestamp: number = Math.floor(Date.now() / 1000)): string {
  return `SAPISIDHASH ${sidHash(timestamp, auth.sapisid)}`;
}

/** A `cookie_store` record as Sonora writes it: `{raw_cookie, domain, …}`. */
type StoredCookie = { raw_cookie?: unknown; domain?: unknown };

function domainOf(domain: unknown): string {
  if (typeof domain === "string") return domain;
  if (typeof domain !== "object" || domain === null) return "";

  const record = domain as Record<string, unknown>;
  for (const key of ["Suffix", "HostOnly"]) {
    if (typeof record[key] === "string") return record[key];
  }

  return "";
}

function isYouTube(domain: string): boolean {
  return domain === "youtube.com" || domain.endsWith(".youtube.com");
}

/**
 * Sonora's live session: `cookies.json` is the cookie store it rotates, so it holds what a
 * browser would send to `music.youtube.com` right now. The `cookies` string in
 * `credentials.json` is the header the account was signed in with and goes stale first.
 */
function cookiesFromStore(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  const pairs = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as StoredCookie;
    if (typeof record.raw_cookie !== "string") return [];
    return isYouTube(domainOf(record.domain)) ? [record.raw_cookie] : [];
  });

  return pairs.length > 0 ? pairs.join("; ") : null;
}

/**
 * A stored session: Sonora's `credentials.json`, its rotated `cookies.json` (also when that
 * file is named directly), or any file holding the bare header.
 */
function cookiesFromFile(path: string): { cookies: string; authUser: string } | null {
  if (!existsSync(path)) return null;

  const body = readFileSync(path, "utf8").trim();
  if (!body.startsWith("{") && !body.startsWith("[")) return { cookies: body, authUser: "" };

  const parsed: unknown = JSON.parse(body);
  if (Array.isArray(parsed)) {
    const cookies = cookiesFromStore(parsed);
    return cookies ? { cookies, authUser: "" } : null;
  }

  const saved = parsed as { kind?: string; cookies?: unknown; authuser?: unknown };
  if (saved.kind === "guest" || typeof saved.cookies !== "string") return null;

  const rotated = join(dirname(path), "cookies.json");
  const store =
    existsSync(rotated) && rotated !== path
      ? cookiesFromStore(JSON.parse(readFileSync(rotated, "utf8")))
      : null;

  return {
    cookies: store ?? saved.cookies,
    authUser: typeof saved.authuser === "number" ? String(saved.authuser) : "",
  };
}

/**
 * The signed-in session the preferences describe: a pasted `Cookie` header, a stored session, or
 * the one a signed-in browser already holds. No cookies at all means guest browsing, not an error.
 */
export function loadAuth(settings: AuthSettings, home: string = homedir()): AuthResult {
  const pasted = (settings.cookies ?? "").trim();
  if (pasted !== "") {
    const auth = parseAuth(pasted, settings.authUser ?? "0");
    return { auth, problem: auth ? null : "The cookies carry no SAPISID or __Secure-3PAPISID." };
  }

  const file = (settings.cookiesFile ?? "").trim();
  let problem: string | null = null;

  if (file !== "") {
    try {
      const found = cookiesFromFile(expandHome(file, home));
      if (found) {
        const auth = parseAuth(found.cookies, found.authUser || settings.authUser || "0");
        if (auth) return { auth, problem: null };
        problem = "The stored cookies carry no SAPISID or __Secure-3PAPISID.";
      }
    } catch (error) {
      problem = `Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  try {
    const cookies = browserCookies(home);
    if (cookies) {
      const auth = parseAuth(cookies, settings.authUser ?? "0");
      if (auth) return { auth, problem: null };
    }
  } catch {
    // a locked keyring must not break guest browsing
  }

  return { auth: null, problem };
}
