import { execFileSync } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A session read out of a browser's own cookie store, so a machine without Sonora does not need
 * a pasted header. Chromium encrypts the values with a keyring password; Firefox does not.
 */

type Sqlite = typeof import("node:sqlite");

/** `node:sqlite` arrived in Node 22.5: an older launcher keeps pasted and Sonora sessions only. */
const SQLITE: Sqlite | null = (() => {
  try {
    return createRequire(join(process.cwd(), "sqlite.cjs"))("node:sqlite") as Sqlite;
  } catch {
    return null;
  }
})();

type Cookie = { name: string; value: string };

const PROOF = ["SAPISID", "__Secure-3PAPISID"];

/** Chromium's cookie expiry counts microseconds from 1601-01-01, Firefox counts seconds from 1970. */
const CHROMIUM_EPOCH = 11_644_473_600;

const CHROMIUM_BROWSERS = [
  { dir: ["BraveSoftware", "Brave-Browser"], keyring: "brave" },
  { dir: ["google-chrome"], keyring: "chrome" },
  { dir: ["chromium"], keyring: "chromium" },
  { dir: ["microsoft-edge"], keyring: "microsoft-edge" },
  { dir: ["vivaldi"], keyring: "vivaldi" },
];

function directories(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

/** The most recently written database first: the profile signed in last is the likely one. */
function newest(paths: string[]): string[] {
  return paths
    .flatMap((path) => {
      try {
        return [{ path, time: statSync(path).mtimeMs }];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.time - left.time)
    .map((found) => found.path);
}

function firefoxDatabases(home: string): string[] {
  const roots = [
    join(home, ".mozilla", "firefox"),
    join(home, "snap", "firefox", "common", ".mozilla", "firefox"),
    join(home, ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"),
  ];

  return newest(
    roots.flatMap((root) => directories(root).map((profile) => join(profile, "cookies.sqlite"))),
  );
}

function chromiumDatabases(configHome: string): Array<{ path: string; root: string; keyring: string }> {
  return CHROMIUM_BROWSERS.flatMap((browser) => {
    const root = join(configHome, ...browser.dir);
    const databases = directories(root).flatMap((profile) => [
      join(profile, "Cookies"),
      join(profile, "Network", "Cookies"),
    ]);

    return newest(databases).map((path) => ({ path, root, keyring: browser.keyring }));
  });
}

function isYouTubeHost(host: string): boolean {
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

/** A stored expiry of zero is a session cookie. */
function alive(expires: number, now: number): boolean {
  return !Number.isFinite(expires) || expires === 0 || expires > now;
}

type Row = Record<string, string | number | bigint | Uint8Array | null>;

function rowsOf<T>(
  path: string,
  query: string,
  read: (row: Row) => T | null,
): T[] {
  if (!SQLITE) return [];

  const database = new SQLITE.DatabaseSync(path, { readOnly: true });
  try {
    return database
      .prepare(query)
      .all()
      .flatMap((row) => {
        const value = read(row as Row);
        return value === null ? [] : [value];
      });
  } finally {
    database.close();
  }
}

/** The signed-in pairs, or null when the store has no Google proof cookie. */
function cookieHeader(rows: Cookie[]): string | null {
  const pairs = new Map<string, string>();
  for (const row of rows) {
    if (row.name !== "" && row.value !== "") pairs.set(row.name, row.value);
  }

  if (!PROOF.some((name) => pairs.get(name))) return null;
  return [...pairs].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function readFirefoxCookies(path: string, now = Date.now() / 1000): string | null {
  const rows = rowsOf(
    path,
    "select name, value, host, cast(expiry as text) as expires from moz_cookies where host like '%youtube.com'",
    (row) => {
      const host = typeof row.host === "string" ? row.host : "";
      if (!isYouTubeHost(host)) return null;
      if (!alive(Number(row.expires ?? 0), now)) return null;

      return {
        name: typeof row.name === "string" ? row.name : "",
        value: typeof row.value === "string" ? row.value : "",
      };
    },
  );

  return cookieHeader(rows);
}

function decrypt(blob: Uint8Array, key: Buffer): Buffer | null {
  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
    return Buffer.concat([decipher.update(blob), decipher.final()]);
  } catch {
    return null;
  }
}

/** Chromium's Linux key: PBKDF2 over the keyring password, one iteration, SHA-1. */
export function deriveKey(password: string): Buffer {
  return pbkdf2Sync(password, "saltysalt", 1, 16, "sha1");
}

/** A `v10`/`v11` cookie value; `v20` is app-bound and cannot be read this way. */
export function decryptChromiumValue(blob: Uint8Array, key: Buffer): string | null {
  const bytes = Buffer.from(blob);
  const prefix = bytes.subarray(0, 3).toString("latin1");
  if (prefix !== "v10" && prefix !== "v11") return null;

  const plain = decrypt(bytes.subarray(3), key);
  if (!plain) return null;

  const value = plain.toString("utf8");
  return value === "" ? null : value;
}

/**
 * The key that encrypts the cookie values: keyring password straight, or the wrapped key stored
 * in `Local State` when the profile has one.
 */
export function keyFromPassword(password: string, encryptedKey?: string): Buffer {
  const base = deriveKey(password);
  if (!encryptedKey) return base;

  const raw = Buffer.from(encryptedKey, "base64");
  const blob = raw.subarray(0, 3).toString("latin1") === "v10" ? raw.subarray(3) : raw;
  return decrypt(blob, base) ?? base;
}

/** Without a keyring the password is the well-known `peanuts`; leftovers decrypt to nothing. */
function keyringPassword(application: string): string {
  try {
    const password = execFileSync("secret-tool", ["lookup", "application", application], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    return password === "" ? "peanuts" : password;
  } catch {
    return "peanuts";
  }
}

function encryptedKeyOf(statePath: string): string | undefined {
  if (!existsSync(statePath)) return undefined;

  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      os_crypt?: { encrypted_key?: unknown };
    };
    return typeof state.os_crypt?.encrypted_key === "string"
      ? state.os_crypt.encrypted_key
      : undefined;
  } catch {
    return undefined;
  }
}

export function readChromiumCookies(
  path: string,
  password: string,
  encryptedKey?: string,
  now = Date.now() / 1000,
): string | null {
  const key = keyFromPassword(password, encryptedKey);

  const rows = rowsOf(
    path,
    "select name, value, encrypted_value, host_key, cast(expires_utc as text) as expires from cookies where host_key like '%youtube.com'",
    (row) => {
      const host = typeof row.host_key === "string" ? row.host_key : "";
      if (!isYouTubeHost(host)) return null;

      const expires = Number(row.expires ?? 0);
      if (!alive(expires === 0 ? 0 : expires / 1_000_000 - CHROMIUM_EPOCH, now)) return null;

      const plain = typeof row.value === "string" && row.value !== "" ? row.value : undefined;
      const encrypted = row.encrypted_value;
      const value =
        plain ?? (encrypted instanceof Uint8Array ? decryptChromiumValue(encrypted, key) : null);
      if (value === null || value === "") return null;

      return { name: typeof row.name === "string" ? row.name : "", value };
    },
  );

  return cookieHeader(rows);
}

/** The first signed-in browser found, as a `Cookie` header; null when none is. */
export function browserCookies(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const path of firefoxDatabases(home)) {
    try {
      const header = readFirefoxCookies(path);
      if (header) return header;
    } catch {
      // a locked or half-written database: try the next profile
    }
  }

  const configHome = env.XDG_CONFIG_HOME || join(home, ".config");
  for (const found of chromiumDatabases(configHome)) {
    try {
      const header = readChromiumCookies(
        found.path,
        keyringPassword(found.keyring),
        encryptedKeyOf(join(found.root, "Local State")),
      );
      if (header) return header;
    } catch {
      // same: the next browser may still have a readable store
    }
  }

  return null;
}
