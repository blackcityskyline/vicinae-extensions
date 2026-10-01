import assert from "node:assert/strict";

import { lovedTracks, recentTracks, topAlbums, topArtists } from "../src/api/lastfm.ts";

let checks = 0;
let skipped = 0;
const pending: Promise<void>[] = [];

// A check that cannot run says so and does not count as a pass: the point of the
// skipped ones here is that they need a key, and reporting them as green would
// say they were verified when they were not.
function check(name: string, body: () => void | string | Promise<void | string>): void {
  pending.push(
    (async () => {
      try {
        const reason = await body();
        if (typeof reason === "string") {
          skipped++;
          console.log(`skip ${name}`);
          console.log(`     ${reason}`);
          return;
        }
        checks++;
        console.log(`ok   ${name}`);
      } catch (error) {
        console.log(`FAIL ${name}`);
        console.log(`     ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    })(),
  );
}

const KEY = process.env.LASTFM_KEY ?? "";
const USER = process.env.LASTFM_USER ?? "";

/**
 * Every fragment below was copied out of a live answer. The two shapes of
 * `artist` are the point: `user.getrecenttracks` puts the name in `#text` and
 * `user.getlovedtracks` puts it in `name`, so a parser written against either
 * one alone shows "Unknown artist" for the other. A test written from the shape
 * you expected would not have caught that.
 */
const RECENTTRACKS = {
  recenttracks: {
    track: [
      {
        name: "My Little Wing",
        url: "https://www.last.fm/music/Venetian+Snares/_/My+Little+Wing",
        mbid: "",
        artist: { mbid: "", "#text": "Venetian Snares" },
        album: { mbid: "", "#text": "My Little Wing" },
        image: [
          { size: "small", "#text": "" },
          { size: "medium", "#text": "" },
          { size: "large", "#text": "" },
        ],
        date: { uts: "1134564139", "#text": "14 Dec 2005, 12:42" },
      },
    ],
    "@attr": { user: "koyaanis", totalPages: "1", page: "1", perPage: "3", total: "3" },
  },
};

const LOVEDTRACKS = {
  lovedtracks: {
    track: [
      {
        name: "Everything In Its Right Place",
        url: "https://www.last.fm/music/Radiohead/_/Everything+In+Its+Right+Place",
        mbid: "",
        artist: { url: "https://www.last.fm/music/Radiohead", name: "Radiohead", mbid: "a74b1b7f" },
        image: [{ size: "large", "#text": "https://lastfm-img.freetls.fastly.net/i/u/174s/x.png" }],
        date: { uts: "1530485480", "#text": "01 Jul 2018, 22:51" },
      },
    ],
    "@attr": { user: "radiohead", total: "1" },
  },
};

const TOPARTISTS = {
  topartists: {
    artist: [
      {
        name: "Radiohead",
        url: "https://www.last.fm/music/Radiohead",
        playcount: "315",
        image: [{ size: "large", "#text": "https://lastfm-img.freetls.fastly.net/i/u/174s/y.png" }],
        "@attr": { rank: "1" },
      },
    ],
    "@attr": { user: "koyaanis", total: "1" },
  },
};

const TOPALBUMS = {
  topalbums: {
    album: [
      {
        name: "Paradise Blown",
        url: "https://www.last.fm/music/Nine+Lazy+Nine/_/Paradise+Blown",
        artist: { url: "https://www.last.fm/music/9+Lazy+9", name: "9 Lazy 9", mbid: "511481ee" },
        image: [{ size: "large", "#text": "https://lastfm-img.freetls.fastly.net/i/u/174s/z.png" }],
        playcount: "1",
        "@attr": { rank: "1" },
      },
    ],
    "@attr": { user: "koyaanis", total: "1" },
  },
};

/** Runs a live call and hands the parsed body to `assert`, for the real API. */
function live(method: string, params: Record<string, string | number>): Promise<any> {
  const query = Object.entries({ api_key: KEY, format: "json", ...params })
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
  return fetch(`https://ws.audioscrobbler.com/2.0/?method=${method}&${query}`).then((response) => response.json());
}

/** A member of a track array, whatever the method did to the shape. */
function oneOf(value: unknown): Record<string, any> {
  return (Array.isArray(value) ? value[0] : value) as Record<string, any>;
}

check("the captured top lists carry a rank, so the row number need not be guessed", () => {
  const artist = oneOf(TOPARTISTS.topartists.artist);
  const album = oneOf(TOPALBUMS.topalbums.album);

  assert.equal(artist["@attr"].rank, "1");
  assert.equal(album["@attr"].rank, "1");
  // What is absent is as useful to pin: these two exist on the chart methods
  // and not on the user ones, so reading them would show nothing at all.
  assert.equal(artist.listeners, undefined);
  assert.equal(artist.tags, undefined);
});

check("the captured answers really do disagree about where the artist name is", () => {
  const recent = oneOf(RECENTTRACKS.recenttracks.track);
  const loved = oneOf(LOVEDTRACKS.lovedtracks.track);

  assert.equal(recent.artist["#text"], "Venetian Snares");
  assert.equal(recent.artist.name, undefined, "getrecenttracks does not send a name member");

  assert.equal(loved.artist.name, "Radiohead");
  assert.equal(loved.artist["#text"], undefined, "getlovedtracks does not send a #text member");
});

check("the live recent-tracks answer is the one the parser was written against", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const body = await live("user.getrecenttracks", { user: USER, limit: 1 });
  const entry = oneOf(body.recenttracks?.track);

  assert.ok(entry?.name, "no recent tracks to check");
  // The whole reason this file exists.
  assert.ok(entry.artist?.["#text"], `artist has no #text either: ${JSON.stringify(entry.artist)}`);
});

check("the four commands map their own answers, when given a key", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const recent = await recentTracks(KEY, USER);
  assert.ok(Array.isArray(recent), "recent tracks did not come back as a list");
  for (const track of recent) {
    assert.notEqual(track.artist, "Unknown artist", `artist lost for ${track.name}: ${JSON.stringify(track.artist)}`);
  }

  const loved = await lovedTracks(KEY, USER);
  assert.ok(Array.isArray(loved));

  const artists = await topArtists(KEY, USER, "overall");
  assert.ok(Array.isArray(artists));
  for (const artist of artists) {
    assert.ok(artist.rank >= 1, `bad rank for ${artist.name}`);
    assert.equal(typeof artist.playcount, "string");
  }

  const albums = await topAlbums(KEY, USER, "overall");
  assert.ok(Array.isArray(albums));
  for (const album of albums) {
    assert.notEqual(album.artist, "Unknown artist", `album artist lost for ${album.name}`);
  }
});

check("a bad key is refused in words, not as an empty list", async () => {
  if (!USER) return "no LASTFM_USER in the environment";

  await assert.rejects(
    () => recentTracks("00000000000000000000000000000001", USER),
    /API key/i,
    "a rejected key produced a list instead of an error",
  );
});

Promise.all(pending).then(() => {
  console.log(`\n${checks} checks passed, ${skipped} skipped`);
  if (skipped > 0) console.log("the skipped ones need a key: LASTFM_KEY=<api key> LASTFM_USER=<name> npm test");
});
