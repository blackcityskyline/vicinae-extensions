import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { loadAuth, parseAuth, sidHash } from "../src/api/auth.ts";
import {
  deriveKey,
  keyFromPassword,
  readChromiumCookies,
  readFirefoxCookies,
} from "../src/api/browser.ts";
import { DaemonError, daemonEnv, daemonSocket, exchange, toPlayerState } from "../src/api/daemon.ts";
import { readHistory, recordPlay } from "../src/api/history.ts";
import {
  clampVolume,
  mpvArgs,
  nextRepeat,
  queueFilenames,
  repeatMode,
  shuffled,
  socketPath,
} from "../src/api/mpv.ts";
import { buildMusicConfig, downloadArgs, playArgs, playlistDownloadArgs } from "../src/api/player.ts";
import { queueRows, readQueueTracks, rememberTracks, type QueueTrack } from "../src/api/queue.ts";
import { iconUrl, thumbnailUrl, videoIdFromUrl } from "../src/utils/ytmusic.ts";

import { parseTheme } from "../src/lib/theme.ts";
import { CARD_H, CARD_W, cardToMarkdown, coverCard, headerCard, imageSize, infoCard, listCard, paneMarkdown, previewMarkdown, type Row } from "../src/lib/pane.ts";
import { artworkFor } from "../src/utils/artwork.ts";

/** A JPEG header as served by `lh3.googleusercontent.com`: SOI, APP0, SOF0. */
function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
}

function png(width: number, height: number): Uint8Array {
  const be = (value: number) => [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, ...be(width), ...be(height), 0x08, 0x02, 0x00, 0x00, 0x00,
  ]);
}

function webp(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff,
    h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff,
  ]);
}

let failures = 0;
function check(name: string, body: () => void) {
  try {
    body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The first 30 bytes of a real 720×404 `hq720.jpg`, which YouTube serves as a
 * VP8 WebP: the keyframe header stores the size pair little-endian.
 */
function webpLossy(): Uint8Array {
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0xfc, 0xe7, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0xf0, 0xe7, 0x00, 0x00, 0x70, 0x71, 0x02, 0x9d,
    0x01, 0x2a, 0xd0, 0x02, 0x94, 0x01,
  ]);
}

const HOME = "/home/tester";

const asyncChecks: Array<() => Promise<void>> = [];

function checkAsync(name: string, body: () => Promise<void>) {
  asyncChecks.push(async () => {
    try {
      await body();
      console.log(`ok   ${name}`);
    } catch (error) {
      failures++;
      console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

// --- playback and downloads ------------------------------------------------

check("the preferences default to mpv and a Music folder, and split player args", () => {
  assert.deepEqual(buildMusicConfig({}, HOME, {}), {
    backend: "mpv",
    daemon: "ytmusicd",
    auth: { cookies: undefined, cookiesFile: undefined, authUser: undefined },
    player: "mpv",
    playerArgs: [],
    window: false,
    downloadDir: "/home/tester/Music/YouTube Music",
    cacheDir: "/home/tester/.cache/ytmusic",
  });

  assert.deepEqual(
    buildMusicConfig({ player: "vlc", playerArgs: '--volume=70 "a b"', downloadDir: "~/Music" }, HOME, {}),
    {
      backend: "mpv",
      daemon: "ytmusicd",
      auth: { cookies: undefined, cookiesFile: undefined, authUser: undefined },
      player: "vlc",
      playerArgs: ["--volume=70", "a b"],
      window: false,
      downloadDir: "/home/tester/Music",
      cacheDir: "/home/tester/.cache/ytmusic",
    },
  );

  assert.equal(buildMusicConfig({ downloadDir: "/srv/music" }, HOME, {}).downloadDir, "/srv/music");
  // an empty textfield is "unset", not an empty command
  assert.equal(buildMusicConfig({ player: "  " }, HOME, {}).player, "mpv");
  // the history follows XDG, so a cleaned cache is cleaned with it
  assert.equal(
    buildMusicConfig({}, HOME, { XDG_CACHE_HOME: "/var/cache/tester" }).cacheDir,
    "/var/cache/tester/ytmusic",
  );
});

check("the player window preference turns mpv's headless flags off", () => {
  const headless = buildMusicConfig({}, HOME);
  const windowed = buildMusicConfig({ playerWindow: true }, HOME);
  assert.equal(windowed.window, true);

  const socket = "/run/user/1000/vicinae-ytmusic.sock";
  assert.deepEqual(mpvArgs(socket, headless), [
    "--idle=yes",
    "--force-window=no",
    "--no-video",
    "--no-terminal",
    `--input-ipc-server=${socket}`,
  ]);
  assert.deepEqual(mpvArgs(socket, { ...windowed, playerArgs: ["--volume=70"] }), [
    "--idle=yes",
    "--force-window=yes",
    "--no-terminal",
    `--input-ipc-server=${socket}`,
    "--volume=70",
  ]);
});

check("shuffle play is a permutation, and the repeat action cycles off → all → one", () => {
  assert.deepEqual(shuffled(["a", "b", "c"], () => 0), ["b", "c", "a"]);
  assert.deepEqual(shuffled([], () => 0.5), []);
  const order = ["1", "2", "3", "4", "5"];
  assert.deepEqual(shuffled(order, () => 0.37).slice().sort(), order);

  assert.equal(repeatMode(false, false), "off");
  assert.equal(repeatMode("inf", false), "all");
  assert.equal(repeatMode("no", "inf"), "one");
  assert.equal(repeatMode("no", "no"), "off");

  assert.equal(nextRepeat("off"), "all");
  assert.equal(nextRepeat("all"), "one");
  assert.equal(nextRepeat("one"), "off");
});

check("a song url yields its video id and the cover YouTube serves for it", () => {
  assert.equal(videoIdFromUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://music.youtube.com/playlist?list=PL1"), undefined);
  assert.equal(videoIdFromUrl("not a url"), undefined);
  assert.equal(thumbnailUrl("dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
});

check("play is the configured player with its arguments", () => {
  const config = buildMusicConfig({ player: "mpv", playerArgs: "--volume=70" }, HOME);
  assert.deepEqual(playArgs("https://music.youtube.com/watch?v=x", config), [
    "https://music.youtube.com/watch?v=x",
    "--volume=70",
  ]);
});

check("downloads are MP3s under the download folder", () => {
  const config = buildMusicConfig({ downloadDir: "/music" }, HOME);
  assert.deepEqual(downloadArgs("https://music.youtube.com/watch?v=x", config), [
    "https://music.youtube.com/watch?v=x",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--output",
    "/music/%(artist,creator,uploader)s/%(title)s.%(ext)s",
  ]);
});

check("an album or playlist download gets its own numbered folder", () => {
  const config = buildMusicConfig({ downloadDir: "/music" }, HOME, {});
  assert.deepEqual(playlistDownloadArgs("https://music.youtube.com/playlist?list=PL1", "AC/DC", config), [
    "https://music.youtube.com/playlist?list=PL1",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--output",
    "/music/AC_DC/%(playlist_index)s - %(title)s.%(ext)s",
  ]);
});

// --- the signed-in half ----------------------------------------------------

check("a cookie header keeps its signed-in pairs, and SAPISIDHASH matches Google's vector", () => {
  assert.deepEqual(parseAuth("VISITOR=abc; SAPISID=ABC123;  PREF=f1", "2"), {
    cookies: "VISITOR=abc; SAPISID=ABC123; PREF=f1",
    sapisid: "ABC123",
    authUser: 2,
  });
  // sha1 of "1700000000 ABC123 https://music.youtube.com", the origin music.youtube.com
  assert.equal(sidHash(1700000000, "ABC123"), "1700000000_140ae8acb03af0c5759adfcca786de9ab339fa31");
  // a header without SAPISID is a guest's: it cannot sign a request
  assert.equal(parseAuth("PREF=f1; VISITOR=abc"), null);
  assert.equal(parseAuth("__Secure-3PAPISID=xyz")?.sapisid, "xyz");
});

check("Sonora's stored session signs in, and a guest's does not", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-auth-"));
  try {
    const sonora = join(dir, "credentials.json");
    writeFileSync(
      sonora,
      JSON.stringify({ kind: "cookies", cookies: "SAPISID=zzz; PREF=f1", authuser: 1 }),
    );
    const signedIn = loadAuth({ cookiesFile: sonora }, dir);
    assert.equal(signedIn.auth?.sapisid, "zzz");
    assert.equal(signedIn.auth?.authUser, 1);
    assert.equal(signedIn.problem, null);

    const guest = join(dir, "guest.json");
    writeFileSync(guest, JSON.stringify({ kind: "guest" }));
    assert.deepEqual(loadAuth({ cookiesFile: guest }, dir), { auth: null, problem: null });

    const rejected = loadAuth({ cookies: "PREF=f1" }, dir);
    assert.equal(rejected.auth, null);
    assert.match(rejected.problem ?? "", /SAPISID/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("Sonora's rotated cookie store beats the stale credentials header", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-store-"));
  try {
    writeFileSync(
      join(dir, "credentials.json"),
      JSON.stringify({ kind: "cookies", cookies: "SAPISID=old; PREF=f1", authuser: 1 }),
    );
    writeFileSync(
      join(dir, "cookies.json"),
      JSON.stringify([
        { raw_cookie: "SAPISID=new", domain: { Suffix: "youtube.com" } },
        { raw_cookie: "SID=abc", domain: { HostOnly: "music.youtube.com" } },
        { raw_cookie: "NOPE=1", domain: { Suffix: "example.com" } },
      ]),
    );

    const fromCredentials = loadAuth({ cookiesFile: join(dir, "credentials.json") }, dir);
    assert.equal(fromCredentials.auth?.sapisid, "new");
    assert.equal(fromCredentials.auth?.cookies, "SAPISID=new; SID=abc");
    assert.equal(fromCredentials.auth?.authUser, 1);

    // the store can also be named directly; the preference picks the account index
    const direct = loadAuth({ cookiesFile: join(dir, "cookies.json"), authUser: "2" }, dir);
    assert.equal(direct.auth?.sapisid, "new");
    assert.equal(direct.auth?.authUser, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Chromium's Linux format: `v11` + AES-128-CBC with sixteen spaces as the IV. */
function encryptChromium(value: string, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from("v11"), cipher.update(value, "utf8"), cipher.final()]);
}

/** The key Chromium wraps into `Local State`, itself encrypted with the keyring password. */
function wrapKey(key: Buffer, password: string): string {
  const cipher = createCipheriv("aes-128-cbc", deriveKey(password), Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from("v10"), cipher.update(key), cipher.final()]).toString("base64");
}

const CHROMIUM_EPOCH = 11_644_473_600;

function chromiumExpiry(seconds: number): number {
  return Math.round((seconds + CHROMIUM_EPOCH) * 1_000_000);
}

check("a Firefox profile's youtube cookies become a signed-in header", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-firefox-"));
  try {
    const path = join(dir, "cookies.sqlite");
    const database = new DatabaseSync(path);
    database.exec("create table moz_cookies (name text, value text, host text, expiry integer)");
    const insert = database.prepare("insert into moz_cookies values (?, ?, ?, ?)");
    const now = Math.floor(Date.now() / 1000);
    insert.run("SAPISID", "fresh", ".youtube.com", now + 3600);
    insert.run("PREF", "f1", ".youtube.com", 0);
    insert.run("OLD", "gone", ".youtube.com", now - 3600);
    insert.run("SAPISID", "elsewhere", ".example.com", now + 3600);
    insert.run("__Secure-3PAPISID", "sec", ".music.youtube.com", now + 3600);
    database.close();

    assert.equal(readFirefoxCookies(path), "SAPISID=fresh; PREF=f1; __Secure-3PAPISID=sec");

    const guest = join(dir, "guest.sqlite");
    const guestDb = new DatabaseSync(guest);
    guestDb.exec("create table moz_cookies (name text, value text, host text, expiry integer)");
    guestDb.prepare("insert into moz_cookies values (?, ?, ?, ?)").run(
      "PREF",
      "f1",
      ".youtube.com",
      now + 3600,
    );
    guestDb.close();
    assert.equal(readFirefoxCookies(guest), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("a Chromium profile's encrypted values decrypt, and an expired cookie is dropped", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-chromium-"));
  try {
    const password = "peanuts";
    const key = Buffer.from("0123456789abcdef");
    const path = join(dir, "Cookies");
    const database = new DatabaseSync(path);
    database.exec(
      "create table cookies (name text, value text, encrypted_value blob, host_key text, expires_utc integer)",
    );
    const insert = database.prepare("insert into cookies values (?, ?, ?, ?, ?)");
    const now = Date.now() / 1000;
    insert.run("SAPISID", "", encryptChromium("abc", key), ".youtube.com", chromiumExpiry(now + 3600));
    insert.run("SID", "", encryptChromium("def", key), ".youtube.com", chromiumExpiry(now + 3600));
    insert.run("OLD", "", encryptChromium("gone", key), ".youtube.com", chromiumExpiry(now - 3600));
    insert.run("VISITOR", "plain", null, ".youtube.com", chromiumExpiry(now + 3600));
    insert.run("SAPISID", "", encryptChromium("elsewhere", key), ".example.com", chromiumExpiry(now + 3600));
    database.close();

    assert.equal(keyFromPassword(password, wrapKey(key, password)).toString("hex"), key.toString("hex"));
    assert.equal(
      readChromiumCookies(path, password, wrapKey(key, password)),
      "SAPISID=abc; SID=def; VISITOR=plain",
    );
    // a locked keyring leaves the values undecryptable, so the profile reads as a guest
    assert.equal(readChromiumCookies(path, "another password"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("with no Sonora file, a signed-in browser profile signs the session in", () => {
  const home = mkdtempSync(join(tmpdir(), "ytmusic-browser-"));
  try {
    const profile = join(home, ".mozilla", "firefox", "abc.default");
    mkdirSync(profile, { recursive: true });
    const database = new DatabaseSync(join(profile, "cookies.sqlite"));
    database.exec("create table moz_cookies (name text, value text, host text, expiry integer)");
    database
      .prepare("insert into moz_cookies values (?, ?, ?, ?)")
      .run("SAPISID", "from-browser", ".youtube.com", 0);
    database.close();

    const result = loadAuth({ cookiesFile: join(home, "no-sonora.json") }, home);
    assert.equal(result.auth?.sapisid, "from-browser");
    assert.equal(result.problem, null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

});

check("the local history keeps the newest fifty, one row per song", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-history-"));
  const config = { backend: "mpv" as const, daemon: "ytmusicd", auth: {}, player: "mpv", playerArgs: [], window: false, downloadDir: "/music", cacheDir: dir };
  const song = (index: number) => ({
    videoId: `v${index}`,
    title: `Song ${index}`,
    artists: [{ name: "A" }],
    thumbnails: [],
    explicit: false,
    kind: "song" as const,
  });

  try {
    for (let index = 0; index < 55; index++) recordPlay(config, song(index), index);
    // replaying an old song moves it to the front instead of writing a second row
    recordPlay(config, song(10), 1000);

    const history = readHistory(config);
    assert.equal(history.length, 50);
    assert.equal(history[0]?.videoId, "v10");
    assert.equal(history[1]?.videoId, "v54");
    assert.equal(history.filter((played) => played.videoId === "v10").length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("the queue remembers one metadata row per video id, and mpv's playlist is its URLs", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-queue-"));
  const config = { backend: "mpv" as const, daemon: "ytmusicd", auth: {}, player: "mpv", playerArgs: [], window: false, downloadDir: "/music", cacheDir: dir };
  const song = (videoId: string | undefined, title: string, artist = "A") => ({
    videoId,
    title,
    artists: [{ name: artist }],
    thumbnails: videoId ? [{ url: `https://img/${videoId}` }] : [],
    explicit: false,
    kind: "song" as const,
  });

  try {
    rememberTracks(config, [song("a", "First"), song("b", "Second", "B")]);
    // the same id re-queued keeps one row, with the newest metadata in front
    rememberTracks(config, [song("a", "First again"), song(undefined, "No id")]);

    const tracks = readQueueTracks(config);
    assert.deepEqual(
      tracks.map((track) => [track.videoId, track.title]),
      [
        ["a", "First again"],
        ["b", "Second"],
      ],
    );

    writeFileSync(join(dir, "queue.json"), "not json");
    assert.deepEqual(readQueueTracks(config), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("mpv's playlist property yields its filenames, and volume clamps to mpv's ceiling", () => {
  assert.deepEqual(
    queueFilenames([
      { filename: "https://one" },
      { title: "no filename" },
      null,
      "not an entry",
      { filename: "https://two" },
    ]),
    ["https://one", "https://two"],
  );
  assert.deepEqual(queueFilenames(undefined), []);

  assert.equal(clampVolume(-3), 0);
  assert.equal(clampVolume(42.6), 43);
  assert.equal(clampVolume(999), 130);
});


check("the queue lists what Browse queued, not every URL mpv carries", () => {
  const tracks = new Map<string, QueueTrack>([
    ["known", { videoId: "known", title: "Inside Out", artists: ["Duster"] }],
  ]);
  // something else loaded into the same mpv: no title, no artist, no metadata
  const state = {
    paused: false,
    index: 1,
    count: 2,
    volume: 100,
    muted: false,
    shuffle: false,
    repeat: "off" as const,
    queue: ["https://music.youtube.com/watch?v=watched_elsewhere", "https://music.youtube.com/watch?v=known"],
  };

  const rows = queueRows(state, tracks);
  assert.deepEqual(
    rows.map((row) => [row.title, row.position]),
    [["Inside Out", 1]],
    "the foreign entry is hidden and the row keeps mpv's index",
  );
});

checkAsync("a cover with no 1280 frame falls back to the 4:3 one", async () => {
  const original = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.includes("maxresdefault")) return new Response("", { status: 404 });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), { status: 200 });
  }) as typeof fetch;

  try {
    const art = await artworkFor(
      "https://i.ytimg.com/vi/no_maxres/maxresdefault.jpg",
      "https://i.ytimg.com/vi/no_maxres/hqdefault.jpg",
    );
    assert.deepEqual(asked, [
      "https://i.ytimg.com/vi/no_maxres/maxresdefault.jpg",
      "https://i.ytimg.com/vi/no_maxres/hqdefault.jpg",
    ]);
    assert.ok(art.href.startsWith("data:image/jpeg;base64,"));
  } finally {
    globalThis.fetch = original;
  }
});

check("a list row asks the CDN for a thumbnail, not the cover", () => {
  assert.equal(
    iconUrl("https://yt3.googleusercontent.com/abc=w544-h544-l90-rj"),
    "https://yt3.googleusercontent.com/abc=w128-h128-l90-rj",
  );
  assert.equal(iconUrl("https://i.ytimg.com/vi/x/hqdefault.jpg"), "https://i.ytimg.com/vi/x/mqdefault.jpg");
  assert.equal(iconUrl("https://example.com/cover.png"), "https://example.com/cover.png");
});

check("the cover's shape is read from its bytes", () => {
  assert.deepEqual(imageSize(jpeg(544, 544)), { width: 544, height: 544 });
  assert.deepEqual(imageSize(png(480, 360)), { width: 480, height: 360 });
  assert.deepEqual(imageSize(webp(900, 1200)), { width: 900, height: 1200 });
  assert.deepEqual(imageSize(webpLossy()), { width: 720, height: 404 });
  assert.equal(imageSize(Uint8Array.from([0x00, 0x01, 0x02])), undefined, "unknown bytes are not guessed at");
});

check("the card frames the cover without changing its shape", () => {
  const square = coverCard("data:image/jpeg;base64,AA==", { width: 544, height: 544 });
  const portrait = coverCard("data:image/jpeg;base64,AA==", { width: 900, height: 1200 });
  const wide = coverCard("data:image/jpeg;base64,AA==", { width: 480, height: 360 });
  const frames = (card: string) =>
    [...card.matchAll(/<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*href=/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]), w: Number(match[3]), h: Number(match[4]) }),
    );

  for (const [card, ratio] of [
    [square, 1],
    [portrait, 900 / 1200],
    [wide, 4 / 3],
  ] as const) {
    // The backdrop uses the same element with a negative offset and an `opacity`;
    // the framed cover is the one the pattern above finds.
    const [art] = frames(card) as [{ x: number; y: number; w: number; h: number }];
    assert.ok(Math.abs(art.w / art.h - ratio) < 0.01, `drawn at ${art.w}×${art.h}, not the source ratio ${ratio}`);
    assert.ok(art.w <= CARD_W - 36 && art.h <= CARD_H - 36, "the frame stays inside the card");
  }
});

check("a card without a readable picture is still a card", () => {
  const card = coverCard("", undefined);
  assert.match(card, new RegExp(`viewBox="0 0 ${CARD_W} ${CARD_H}"`));
  assert.equal(/<image /.test(card), false, "no picture to draw");
});

check("a preview pane is two cards, and a note replaces the lines it cannot show", () => {
  const lines: [string, string][] = [["Hells Bells", "AC/DC"], ["Back & Black", "AC/DC"]];
  const list = listCard(lines);
  assert.match(list, /Hells Bells/);
  assert.match(list, /Back &amp; Black/, "markup in a name is escaped, not drawn");

  const loading = listCard(lines, "Loading\u2026");
  assert.match(loading, /Loading/);
  assert.equal(loading.includes("Hells Bells"), false, "a note stands in for the lines");

  const many = listCard(Array.from({ length: 9 }, (_, i): [string, string] => [`Track ${i}`, ""]));
  assert.equal(many.includes("Track 4") && !many.includes("Track 5"), true, "five lines fit the card, the rest is the page's own");

  const pane = previewMarkdown("History", "The plays YouTube Music remembers, newest first.", lines);
  assert.equal(pane.split("\n\n").length, 2, "header card, then the list card");
  assert.equal([...pane.matchAll(/raycast-height=180/g)].length, 2, "each card declares the box the pane gives it");
});

check("a header card wraps its words to three lines and cuts the last", () => {
  const card = headerCard("Albums", "word ".repeat(120));
  assert.equal([...card.matchAll(/opacity="0.62"/g)].length, 3);
  assert.match(card, /\u2026<\/text>/, "the last line ends with an ellipsis");
});

check("the mpv socket does not move with the launcher's per-run TMPDIR", () => {
  const saved = process.env.TMPDIR;
  try {
    process.env.TMPDIR = "/tmp/vicinae-run-one";
    const first = socketPath({});
    process.env.TMPDIR = "/tmp/vicinae-run-two";
    const second = socketPath({});
    assert.equal(first, second, "a new run must find the mpv the last one started");
    assert.ok(!first.startsWith("/tmp/vicinae-run"), `socket followed TMPDIR: ${first}`);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }

  assert.equal(socketPath({ XDG_RUNTIME_DIR: "/run/user/7" }), "/run/user/7/vicinae-ytmusic.sock");
});

check("the card ink comes from the launcher's theme file", () => {
  // The shape of a real theme (dch.toml): comments, other sections, and the
  // text colour declared after the colour the card must not pick up.
  const theme = [
    '# Vicinae theme',
    '[meta]',
    'name = "DCH"',
    'variant = "dark"',
    '',
    '[colors.core]',
    'accent = "#e7bfac"',
    'background = "#1c110c"',
    'foreground = "#f1dfd8"   # main text',
    '',
    '[colors.list.item]',
    'foreground = "#000000"',
  ].join("\n");

  assert.equal(parseTheme(theme), "#f1dfd8", "the core text colour, not a later section's");
  assert.equal(parseTheme('[meta]\nvariant = "light"\n'), undefined, "a theme with no core colours has nothing to give");
  assert.equal(parseTheme('[colors.core]\nforeground = "Canvas"'), undefined, "a name this card cannot draw is not a colour");
});

check("the info card keeps a title with markup intact, and stays one line", () => {
  const card = infoCard("AC/DC & <Friends>", "Rock \u00b7 1973", [["Progress", "2:38 / 4:16"]]);
  assert.match(card, /AC\/DC &amp; &lt;Friends&gt;/, "a raw & or < breaks the SVG");
  assert.doesNotMatch(card, /<Friends>/);
  assert.match(card, /2:38 \/ 4:16/);

  const long = infoCard("x".repeat(80), undefined, []);
  assert.doesNotMatch(long, /x{40}/, "a title too long for the card is cut, not shrunk");
  assert.match(long, /\u2026/);
});

check("a card carries the box the pane must give it", () => {
  const markdown = cardToMarkdown(coverCard("", undefined));
  assert.match(markdown, new RegExp(`^!\\[\\]\\(data:image/svg\\+xml\\?raycast-width=${CARD_W}&raycast-height=${CARD_H}#x,`));
});

check("free text sits at the foot of the facts card, not under it", () => {
  const facts = { title: "Stratosphere", subtitle: "Duster", rows: [["Type", "Album"]] as Row[] };
  const art = { href: "", size: undefined };
  const heights = (markdown: string) => markdown.match(/raycast-height=(\d+)/g);

  const withText = paneMarkdown({ ...facts, description: "A *quiet* record, played loud." }, art);
  assert.deepEqual(heights(withText), ["raycast-height=180", "raycast-height=180"]);
  assert.equal(
    withText.split("\n\n").length,
    2,
    "two cards and no text block: the pane is the cards only",
  );

  const card = infoCard(facts.title, facts.subtitle, facts.rows, "A *quiet* record & played loud.");
  assert.match(card, /A \*quiet\* record &amp; played loud\./, "drawing the text needs SVG escaping");
});

check("an over-long free text is wrapped to two lines and cut", () => {
  const card = infoCard("Title", undefined, [], "word ".repeat(80));
  const drawn = [...card.matchAll(/font-size="11"[^>]*>([^<]*)</g)].map((match) => match[1] ?? "");

  assert.equal(drawn.length, 2, "a card has room for two lines");
  assert.ok(drawn.every((line) => line.length <= 66), "a line stays inside the card");
  assert.match(drawn[1] ?? "", /\u2026$/, "the rest is cut, not shrunk");
});

// --- the daemon client -----------------------------------------------------

check("the daemon socket is where ytmusicd and ytmusicctl look", () => {
  assert.equal(daemonSocket({ XDG_RUNTIME_DIR: "/run/user/1000" }, HOME), "/run/user/1000/ytmusic/ytmusicd.sock");
  assert.equal(daemonSocket({}, HOME), "/home/tester/.cache/ytmusic/ytmusicd.sock");
  assert.equal(daemonSocket({ XDG_RUNTIME_DIR: "" }, HOME), "/home/tester/.cache/ytmusic/ytmusicd.sock", "empty means unset");
  assert.equal(daemonSocket({}, null), "/tmp/ytmusic/ytmusicd.sock");
});

check("a daemon the launcher starts gets the cookies in its environment, never its arguments", () => {
  const config = buildMusicConfig({ cookies: "SAPISID=abc; SID=1", authUser: "2" }, HOME, {});
  const env = daemonEnv(config, { PATH: "/bin" });
  assert.equal(env.YTMUSIC_AUTHUSER, "2");
  assert.match(env.YTMUSIC_COOKIES ?? "", /SAPISID=abc/);
  assert.equal(env.PATH, "/bin");
  assert.equal(daemonEnv(buildMusicConfig({ cookies: "" , cookiesFile: "/no/such"}, HOME, {}), { PATH: "/bin" }).YTMUSIC_COOKIES, undefined, "a guest sends none");
});

const wireTrack = (videoId: string, title: string, duration = 200) => ({
  videoId, title, artists: [{ name: "A" }], thumbnails: [], explicit: false, kind: "song" as const, duration,
});

check("daemon state becomes the player state the views already read", () => {
  const queue = { entries: [{ entry: 7, track: wireTrack("aaaaaaaaaaa", "One") }, { entry: 9, track: wireTrack("bbbbbbbbbbb", "Two") }] };
  const state = {
    status: "playing" as const, entry: 9,
    clock: { position_ms: 10_000, at_ms: 1_000_000, rate: 1 },
    volume: 70, muted: false, shuffle: true, repeat: "all" as const,
  };
  const shown = toPlayerState(state, queue, 1_005_000)!;
  assert.equal(shown.title, "Two");
  assert.equal(shown.position, 15, "the anchor plus the time since it, at rate 1");
  assert.equal(shown.index, 2);
  assert.equal(shown.count, 2);
  assert.equal(shown.queue[0], "https://music.youtube.com/watch?v=aaaaaaaaaaa");
  assert.equal(videoIdFromUrl(shown.path ?? ""), "bbbbbbbbbbb");
  assert.deepEqual([shown.paused, shown.volume, shown.shuffle, shown.repeat], [false, 70, true, "all"]);

  const paused = toPlayerState({ ...state, status: "paused", clock: { ...state.clock, rate: 0 } }, queue, 9_999_999)!;
  assert.equal(paused.position, 10, "a paused clock does not move");
  assert.equal(paused.paused, true);
  assert.equal(toPlayerState({ ...state, status: "stopped", entry: undefined }, queue), null, "nothing loaded is not a player");
});

checkAsync("exchange says hello first, numbers the commands after it and returns their answers in order", async () => {
  const { createServer } = await import("node:net");
  const dir = mkdtempSync(join(tmpdir(), "ytd-"));
  const socket = join(dir, "d.sock");
  const seen: unknown[] = [];
  const server = createServer((client) => {
    let buffer = "";
    client.on("data", (chunk) => {
      buffer += chunk.toString();
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const line = JSON.parse(buffer.slice(0, nl)) as { id: number; cmd: string };
        buffer = buffer.slice(nl + 1);
        seen.push(line);
        const reply = line.cmd === "boom"
          ? { id: line.id, ok: false, error: { code: "not_found", message: "no such entry" } }
          : { id: line.id, ok: true, data: line.cmd === "hello" ? undefined : { echo: line.cmd } };
        client.write(`${JSON.stringify(reply)}\n`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  try {
    const answers = await exchange(socket, [{ cmd: "state" }, { cmd: "queue.get" }]);
    assert.deepEqual(answers, [{ echo: "state" }, { echo: "queue.get" }]);
    assert.deepEqual((seen[0] as { cmd: string; args: { protocol: number } }).cmd, "hello");
    assert.equal((seen[0] as { args: { protocol: number } }).args.protocol, 1);
    assert.deepEqual(seen.slice(1).map((line) => (line as { id: number }).id), [2, 3]);

    await assert.rejects(exchange(socket, [{ cmd: "boom" }]), (error: unknown) => error instanceof DaemonError && error.code === "not_found");
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

void (async () => {
  for (const run of asyncChecks) await run();
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})();
