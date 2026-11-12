import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { readHistory, recordPlay } from "../src/api/history.ts";
import { mpvArgs, nextRepeat, queueFilenames, repeatMode, shuffled, clampVolume } from "../src/api/mpv.ts";
import { buildMusicConfig, downloadArgs, playArgs, playlistDownloadArgs } from "../src/api/player.ts";
import { readQueueTracks, rememberTracks } from "../src/api/queue.ts";
import {
  LIBRARY_ALBUMS,
  musicAlbum,
  musicArtist,
  musicLibraryItems,
  musicPlaylistPage,
  searchMusic,
  setAuth,
} from "../src/api/ytmusic.ts";
import {
  countFromText,
  musicPlaylistUrl,
  parseClock,
  parseShelves,
  parseYear,
  thumbnailUrl,
  videoIdFromUrl,
} from "../src/utils/ytmusic.ts";

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

// Real answers of music.youtube.com's web API, trimmed to the fields the parser reads.
const fixture = (name: string): string => readFileSync(join(__dirname, "fixtures", name), "utf8");

/** Answers every request with one recorded response, so the client runs headless. */
async function withFixture<T>(name: string, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const body = fixture(name);
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).includes("sw.js_data")
      ? new Response("", { status: 200 })
      : new Response(body, { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const HOME = "/home/tester";

// --- ytmusic-rs's own unit tests -------------------------------------------

check("the ported clock, year and count helpers keep their cases", () => {
  assert.equal(parseClock("3:05"), 185);
  assert.equal(parseClock("1:02:03"), 3723);
  assert.equal(parseClock("abc"), undefined);
  assert.equal(parseYear("2021"), 2021);
  assert.equal(parseYear("21"), undefined);
  assert.equal(countFromText("34 songs"), 34);
  assert.equal(countFromText("1,204 songs"), 1204);
  assert.equal(countFromText("2016"), undefined);
});

check("a music home becomes shelves of tracks and playlists", () => {
  const shelves = parseShelves(JSON.parse(fixture("music-home.json")));
  assert.ok(shelves.length > 1);

  const picks = shelves.find((shelf) => shelf.title === "Quick picks");
  assert.ok(picks, "the home page has no Quick picks shelf");
  const first = picks.items[0];
  assert.ok(first && "track" in first);
  assert.ok(first.track.videoId);
  assert.ok(first.track.title.length > 0);
  assert.ok(first.track.artists.length > 0);
  assert.ok(first.track.thumbnails.length > 0);

  const beatIt = picks.items.find((item) => "track" in item && item.track.title === "Beat It");
  assert.ok(beatIt && "track" in beatIt);
  assert.equal(beatIt.track.artists[0]?.name, "Michael Jackson");
  assert.equal(beatIt.track.album?.name, "Thriller");

  const releases = shelves.find((shelf) => shelf.title === "New releases");
  assert.ok(releases, "the home page has no New releases shelf");
  const card = releases.items[0];
  assert.ok(card && "album" in card);
  assert.match(card.album.browseId, /^MPREb_/);
  assert.ok(card.album.artists.length > 0);
});

check("a genre grid becomes pages that carry their params", () => {
  const shelves = parseShelves(JSON.parse(fixture("music-genres.json")));
  assert.deepEqual(shelves.map((shelf) => shelf.title), ["Moods & moments", "Genres"]);

  const chill = shelves[0]!.items[0];
  assert.ok(chill && "page" in chill);
  assert.equal(chill.page.title, "Chill");
  assert.equal(chill.page.pageType, "genre");
  assert.equal(chill.page.browseId, "FEmusic_moods_and_genres_category");
  assert.ok((chill.page.params ?? "").length > 0);
});

check("a music search is grouped by kind", () => {
  const shelves = parseShelves(JSON.parse(fixture("music-search.json")));
  assert.deepEqual(
    shelves.map((shelf) => shelf.title),
    ["Songs", "Albums", "Artists", "Playlists"],
  );

  const song = shelves[0]!.items[0];
  assert.ok(song && "track" in song);
  assert.equal(song.track.artists[0]?.name, "Daft Punk");

  const album = shelves[1]!.items[0];
  assert.ok(album && "album" in album);
  assert.equal(album.album.year, 2013);
  assert.equal(album.album.artists[0]?.name, "Daft Punk");

  const artist = shelves[2]!.items[0];
  assert.ok(artist && "page" in artist);
  assert.equal(artist.page.pageType, "artist");

  const playlist = shelves[3]!.items[0];
  assert.ok(playlist && "playlist" in playlist);
  assert.match(playlist.playlist.id, /^PL/);
});

check("an empty shelf is dropped, and a playlist id becomes yt-dlp's URL", () => {
  assert.deepEqual(parseShelves({ musicShelfRenderer: { contents: [] } }), []);
  assert.equal(
    musicPlaylistUrl("OLAK5uy_x"),
    "https://music.youtube.com/playlist?list=OLAK5uy_x",
  );
});

checkAsync("an album page carries its header, its playlist and its tracks", async () => {
  const detail = await withFixture("music-album.json", () => musicAlbum("MPREb_Nn5EVpTMYYl"));

  assert.equal(detail.album.title, "А вокруг туман");
  assert.equal(detail.album.kind, "Single");
  assert.equal(detail.album.artists[0]?.name, "ENZRO");
  assert.match(detail.album.playlistId ?? "", /^OLAK5uy_/);
  assert.equal(detail.album.trackCount, 1);
  assert.ok(detail.album.thumbnails.length > 0);

  const track = detail.tracks[0];
  assert.ok(track);
  assert.equal(track.duration, 227);
  assert.equal(track.album?.name, "А вокруг туман");
  assert.equal(track.artists[0]?.name, "ENZRO");
});

checkAsync("an artist page carries top songs, albums and singles", async () => {
  const artist = await withFixture("music-artist.json", () => musicArtist("UCptBkLZ6XRxoyn8SkUMc_Iw"));

  assert.equal(artist.name, "Alka Yagnik");
  assert.equal(artist.subscribers, "2.32M");
  assert.match(artist.description ?? "", /playback singer/);
  assert.ok(artist.topTracks.length > 1);
  assert.ok(artist.albums.length > 0);
  assert.ok(artist.singles.length > 0);
  assert.deepEqual(artist.albums[0]?.artists, [{ name: "Alka Yagnik", id: "UCptBkLZ6XRxoyn8SkUMc_Iw" }]);
});

checkAsync("a playlist page carries its header and its tracks", async () => {
  const detail = await withFixture("music-playlist.json", () =>
    musicPlaylistPage("PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0"),
  );

  assert.equal(detail.playlist.id, "PL4fGSI1pDJn6t3TXLGiiJdD-sZbrG3tG0");
  assert.equal(detail.playlist.title, "Daily Top Music Videos - Global");
  assert.equal(detail.playlist.trackCount, 100);
  assert.equal(detail.tracks.length, 4);
  assert.equal(detail.tracks[0]?.duration, 291);
});

// --- playback and downloads ------------------------------------------------

check("the preferences default to mpv and a Music folder, and split player args", () => {
  assert.deepEqual(buildMusicConfig({}, HOME, {}), {
    player: "mpv",
    playerArgs: [],
    window: false,
    downloadDir: "/home/tester/Music/YouTube Music",
    cacheDir: "/home/tester/.cache/ytmusic",
  });

  assert.deepEqual(
    buildMusicConfig({ player: "vlc", playerArgs: '--volume=70 "a b"', downloadDir: "~/Music" }, HOME, {}),
    {
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

check("a continuation page's rows are shelves too", () => {
  const row = {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: "Discovery" }] },
      subtitle: { runs: [{ text: "Daft Punk" }] },
      navigationEndpoint: { browseEndpoint: { browseId: "MPREb_discovery" } },
    },
  };
  const shelves = parseShelves({ gridContinuation: { items: [row] } });
  assert.equal(shelves.length, 1);
  const item = shelves[0]?.items[0];
  assert.ok(item && "album" in item);
  assert.equal(item.album.browseId, "MPREb_discovery");
  assert.equal(item.album.artists[0]?.name, "Daft Punk");
});

check("the local history keeps the newest fifty, one row per song", () => {
  const dir = mkdtempSync(join(tmpdir(), "ytmusic-history-"));
  const config = { player: "mpv", playerArgs: [], window: false, downloadDir: "/music", cacheDir: dir };
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
  const config = { player: "mpv", playerArgs: [], window: false, downloadDir: "/music", cacheDir: dir };
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
      tracks.map((track) => [track.videoId, track.title, track.thumbnail]),
      [
        ["a", "First again", "https://img/a"],
        ["b", "Second", "https://img/b"],
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

checkAsync("a signed-in search sends the cookies and the filter's params", async () => {
  const seen: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("sw.js_data")) {
      return new Response('["CgVISITOR12345678901234567890"]', { status: 200 });
    }
    seen.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    setAuth(parseAuth("SAPISID=ABC123; PREF=f1"));
    await searchMusic("daft punk", "songs");
    const signed = seen[0]!;
    assert.equal(signed.body.params, "EgWKAQIIAWoMEA4QChADEAQQCRAF");
    assert.equal((signed.body.context as { client: { visitorData?: string } }).client.visitorData, undefined);
    assert.equal(signed.headers.get("cookie"), "SAPISID=ABC123; PREF=f1");
    assert.match(signed.headers.get("authorization") ?? "", /^SAPISIDHASH \d+_[0-9a-f]{40}$/);
    assert.equal(signed.headers.get("x-goog-authuser"), "0");
    assert.equal(signed.headers.get("x-goog-visitor-id"), null);

    setAuth(null);
    await searchMusic("daft punk", "albums");
    const guest = seen[1]!;
    assert.equal(guest.body.params, "EgWKAQIYAWoMEA4QChADEAQQCRAF");
    assert.equal(guest.headers.get("cookie"), null);
    assert.equal(guest.headers.get("authorization"), null);
    assert.equal(guest.headers.get("x-goog-visitor-id"), "CgVISITOR12345678901234567890");
  } finally {
    setAuth(null);
    globalThis.fetch = original;
  }
});

checkAsync("a rejected cookie reads as a sign-in problem, not a guest answer", async () => {
  const original = globalThis.fetch;
  const body = {
    responseContext: {
      serviceTrackingParams: [
        { service: "GFEEDBACK", params: [{ key: "logged_in", value: "0" }] },
      ],
    },
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    setAuth(parseAuth("SAPISID=expired"));
    await assert.rejects(searchMusic("daft punk"), /did not accept the cookies/);
  } finally {
    setAuth(null);
    globalThis.fetch = original;
  }
});

checkAsync("the library refuses a guest instead of asking anonymously", async () => {
  setAuth(null);
  await assert.rejects(musicLibraryItems(LIBRARY_ALBUMS), /Sign in/);
});

void (async () => {
  // one stub at a time: `withFixture` swaps the process's fetch
  for (const run of asyncChecks) await run();
  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
})();
