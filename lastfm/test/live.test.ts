import assert from "node:assert/strict";

import {
  artistPage,
  globalChart,
  libraryArtists,
  lovedTracks,
  recentTracks,
  searchArtists,
  topAlbums,
  topArtists,
  topTracks,
  weeklyChart,
} from "../src/api/lastfm.ts";

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

check("the chart views map their own answers, when given a key", async () => {
  if (!KEY) return "no LASTFM_KEY in the environment";

  const chart = await globalChart(KEY);
  assert.ok(chart.artists.length > 0, "no chart artists");
  assert.ok(chart.tracks.length > 0, "no chart tracks");
  for (const entry of chart.tracks) {
    assert.notEqual(entry.artist, "Unknown artist", `chart track lost its artist: ${entry.name}`);
  }
});

check("an artist page names every artist it lists", async () => {
  if (!KEY) return "no LASTFM_KEY in the environment";

  const page = await artistPage(KEY, "Portishead");
  assert.equal(page.name, "Portishead");
  assert.ok(page.tags.length > 0, "no tags on a well known artist");
  assert.ok(page.tracks.length > 0, "no top tracks");
  assert.ok(page.albums.length > 0, "no top albums");
  for (const entry of page.albums) {
    assert.notEqual(entry.artist, "Unknown artist", `album lost its artist: ${entry.name}`);
  }
  for (const entry of page.similar) {
    assert.ok(entry.name.length > 0, "a similar artist with no name");
  }
});

check("the weekly charts are the ones with rows in them", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  // user.getWeeklyChartList is not this: it answers with 1128 entries of
  // { "#text": "", from, to } for this account, all of them empty.
  const weekly = await weeklyChart(KEY, USER);
  assert.ok(Array.isArray(weekly.artists), "weekly artists did not come back as a list");
  assert.ok(Array.isArray(weekly.tracks), "weekly tracks did not come back as a list");

  const chartList = await live("user.getWeeklyChartList", { user: USER });
  const rows = (Array.isArray(chartList.weeklychartlist?.chart)
    ? chartList.weeklychartlist.chart
    : [chartList.weeklychartlist?.chart]) as Record<string, unknown>[];
  assert.ok(rows.length > 0, "no chart rows to compare");
  assert.equal(rows[0]?.["#text"], "", "the list endpoint was expected to carry no content");
});

check("the library pages rather than loading all of it", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const first = await libraryArtists(KEY, USER, 1, 5);
  const second = await libraryArtists(KEY, USER, 2, 5);
  assert.equal(first.page, 1);
  assert.equal(second.page, 2);
  assert.ok(first.hasMore, "page one should not be the last");
  const overlap = first.artists.filter((a) => second.artists.some((b) => b.url === a.url));
  assert.equal(overlap.length, 0, `pages repeat: ${overlap.map((a) => a.name).join(", ")}`);
});

check("top tracks parse with their play counts", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const tracks = await topTracks(KEY, USER, "overall");
  assert.ok(Array.isArray(tracks));
  for (const entry of tracks) {
    assert.notEqual(entry.artist, "Unknown artist", `lost the artist for ${entry.name}`);
    assert.ok(entry.rank > 0, `no position for ${entry.name}`);
  }
});

check("artist search answers under artistmatches, with listeners", async () => {
  if (!KEY) return "no LASTFM_KEY in the environment";

  const matches = await searchArtists(KEY, "portishead", 5);
  assert.ok(matches.length > 0, "no matches for a well known artist");
  assert.equal(matches[0]?.name, "Portishead");
  assert.ok(Number(matches[0]?.listeners) > 0, "search results carry listeners and no play count");
});

check("every method that reports a total is read from the member it uses", async () => {
  // This is the check that was missing when `user.gettopartists` was parsed from
  // `artists` instead of `topartists`: unwrapList(undefined) is an empty list, and
  // an empty list looks exactly like an account with nothing in it. It went
  // unnoticed because the account used for testing had no artists at all.
  //
  // So this compares what the API says it has with what came back, for every
  // method, and fails on a disagreement rather than on emptiness.
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const members: [string, string][] = [
    ["user.gettopartists", "topartists"],
    ["user.gettopalbums", "topalbums"],
    ["user.gettoptracks", "toptracks"],
    ["user.getrecenttracks", "recenttracks"],
    ["user.getlovedtracks", "lovedtracks"],
    ["library.getArtists", "artists"],
    ["chart.getTopArtists", "artists"],
  ];

  for (const [method, member] of members) {
    const body = await live(method, { user: USER, limit: 5, period: "overall" });
    if (body.error !== undefined) return `${method} answered error ${body.error}: ${body.message}`;

    const keys = Object.keys(body).filter((key) => key !== "@attr");
    assert.ok(keys.includes(member), `${method} answered under ${keys.join(", ")}, not ${member}`);

    const inner = body[member] as Record<string, unknown>;
    const reported = Number((inner["@attr"] as Record<string, string> | undefined)?.total ?? 0);
    const rows = oneOf(inner.artist ?? inner.track ?? inner.album ?? inner.chart ?? inner.artistmatches);
    if (reported > 0) {
      assert.ok(rows && Object.keys(rows).length > 0, `${method}: reported ${reported} but nothing readable arrived`);
    }
  }
});

check("top artists of a real account come back, not an empty list", async () => {
  if (!KEY || !USER) return "no LASTFM_KEY and LASTFM_USER in the environment";

  const artists = await topArtists(KEY, USER, "overall");
  const body = await live("user.gettopartists", { user: USER, limit: 1, period: "overall" });
  const reported = Number((body.topartists?.["@attr"] as Record<string, string>)?.total ?? 0);

  assert.ok(reported > 0, "this account is reported as having no artists at all");
  assert.equal(artists.length > 0, true, `reported ${reported} artists and parsed none`);
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
