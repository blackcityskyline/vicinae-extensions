import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { accountFrom, authFailure, decodeSession, sessionFrom, sessionToken } from "../src/api/auth.ts";
import { buildConfig } from "../src/api/player.ts";
import {
  albumUrl,
  artistUrl,
  clock,
  parseArtist,
  parseRelease,
  parseSearch,
  sortArtists,
  sortReleases,
  sortTracks,
  streamUrl,
  trackIdFromUrl,
  webUrl,
} from "../src/utils/monochrome.ts";
import { parseEpisodes, parsePodcasts, podcastAuth } from "../src/utils/podcasts.ts";
import { safeName, trackPath } from "../src/utils/paths.ts";

// Captured from tracks.monochrome.st, so a field that moves shows up here first.
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

let failures = 0;
function check(name: string, body: () => void) {
  try {
    body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

check("a search reply becomes playable tracks", () => {
  const tracks = parseSearch(fixture("search-tracks.json")).tracks;
  assert.deepEqual(
    tracks.map((track) => [track.id, track.title, track.artists, track.duration]),
    [
      ["154049681742106624", "Creep", ["Radiohead"], 239],
      ["154064787062394880", "Creep - Acoustic", ["Radiohead"], 259],
    ],
  );
  assert.equal(tracks[0]?.artwork, "https://tracks.monochrome.st/proxy/mi/154041929472937984-1A01.jpg");
  assert.equal(tracks[0]?.playable, true);
});

check("a track carries the artist the artist view opens", () => {
  const [first] = parseSearch(fixture("search-tracks.json")).tracks;
  assert.equal(first?.artistId, "152523067401179136");
  assert.equal(first?.releaseId, "154041929472937984");
});

check("an artist reply carries popular tracks, albums, singles and the link out", () => {
  const artist = parseArtist(fixture("artist.json"));
  assert.ok(artist);
  assert.equal(artist.name, "Radiohead");
  assert.equal(artist.popular.length, 2);
  assert.equal(artist.albums.length, 2);
  assert.equal(artist.singles.length, 2);
  assert.equal(artist.externalLink, "https://waste.lnk.to/radiohead.linksIN");
  assert.equal(artist.popular[0]?.artistId, "152523067401179136");
  assert.ok((artist.albums[0]?.trackCount ?? 0) > 0);
});

check("sorting by title orders a copy and leaves relevance alone", () => {
  const tracks = parseSearch(fixture("search-tracks.json")).tracks;
  assert.equal(sortTracks(tracks, "relevance"), tracks);
  assert.deepEqual(
    sortTracks(tracks, "title").map((track) => track.title),
    ["Creep", "Creep - Acoustic"],
  );
  assert.deepEqual(
    sortTracks([...tracks].reverse(), "title").map((track) => track.title),
    ["Creep", "Creep - Acoustic"],
  );

  const artist = parseArtist(fixture("artist.json"));
  assert.ok(artist);
  const albums = artist.albums;
  assert.equal(sortReleases(albums, "relevance"), albums);
  assert.deepEqual(
    sortReleases([...albums].reverse(), "title").map((album) => album.title),
    [...albums]
      .map((album) => album.title)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
  );
  assert.deepEqual(
    sortArtists([artist], "title").map((entry) => entry.name),
    ["Radiohead"],
  );
});

check("album and artist links point at the web routes", () => {
  assert.equal(albumUrl("42"), "https://monochrome.st/album/42");
  assert.equal(artistUrl("7"), "https://monochrome.st/artist/7");
});

check("an unplayable or malformed entry is dropped", () => {
  assert.deepEqual(
    parseSearch({
      tracks: [
        { trackId: "1", title: "Gone", playable: false },
        { id: "2", title: "No artists", artistNames: [] },
        { trackId: "3", title: "" },
        null,
      ],
    }).tracks.map((track) => track.id),
    ["2"],
  );
  assert.deepEqual(parseSearch(null), { tracks: [], releases: [], artists: [] });
  assert.deepEqual(parseSearch({ tracks: "nope" }), { tracks: [], releases: [], artists: [] });
});

check("a release reply carries its tracks and artwork", () => {
  const release = parseRelease(fixture("release.json"));
  assert.ok(release);
  assert.equal(release.id, "154041929472937984");
  assert.equal(release.title, "Pablo Honey");
  assert.equal(release.artwork, "https://tracks.monochrome.st/proxy/mi/154041929472937984-1A01.jpg");
  assert.equal(release.tracks.length, 3);
  assert.deepEqual(
    release.tracks.map((track) => [track.title, track.artists.join(", "), track.duration]),
    [
      ["You", "Radiohead", 209],
      ["Creep", "Radiohead", 239],
      ["How Do You?", "Radiohead", 132],
    ],
  );
  assert.equal(release.tracks[0]?.releaseId, "154041929472937984");
});

check("a release without an id is not a release", () => {
  assert.equal(parseRelease({ title: "Nowhere" }), null);
  assert.equal(parseRelease("nope"), null);
});

check("stream and web urls encode the track id", () => {
  assert.equal(streamUrl("12 3"), "https://tracks.monochrome.st/track/12%203");
  assert.equal(webUrl("12 3"), "https://monochrome.st/track/12%203");
});

check("the queue recovers a track id from what mpv was given", () => {
  const id = "154049681742106624";
  assert.equal(trackIdFromUrl(streamUrl(id)), id);
  assert.equal(trackIdFromUrl("https://example.com/track/1"), undefined);
  assert.equal(trackIdFromUrl("https://tracks.monochrome.st/track/1/extra"), undefined);
  assert.equal(trackIdFromUrl("not a url"), undefined);
});

check("clock pads seconds and floors the fraction", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(238.7), "3:58");
  assert.equal(clock(3600), "60:00");
  assert.equal(clock(undefined), undefined);
});

check("sign-in returns the bearer token from either shape", () => {
  assert.equal(sessionToken({ token: "abc", user: { email: "a@b.c" } }), "abc");
  assert.equal(sessionToken({ session: { token: "nested" } }), "nested");
  assert.equal(sessionToken({ token: "" }), undefined);
  assert.equal(sessionToken(null), undefined);
});

check("a sign-in reply is a session with the identity it just authenticated", () => {
  assert.deepEqual(sessionFrom({ token: "t", user: { email: "a@b.c", name: "Ada" } }), {
    token: "t",
    account: { email: "a@b.c", name: "Ada" },
  });
  assert.deepEqual(sessionFrom({ token: "t" }), { token: "t", account: {} });
  assert.equal(sessionFrom({ user: { email: "a@b.c" } }), null);
});

check("a stored session round-trips, and anything else is no session", () => {
  const session = { token: "t", account: { email: "a@b.c" } };
  assert.deepEqual(decodeSession(JSON.stringify(session)), session);
  assert.equal(decodeSession(undefined), undefined);
  assert.equal(decodeSession(""), undefined);
  assert.equal(decodeSession("t"), undefined);
  assert.equal(decodeSession("{}"), undefined);
  assert.equal(decodeSession('{"token":""}'), undefined);
});

check("an account record is read from a session reply", () => {
  assert.deepEqual(
    accountFrom({ session: { id: "s" }, user: { email: "a@b.c", name: "Ada" } }),
    { email: "a@b.c", name: "Ada" },
  );
  assert.deepEqual(accountFrom({ user: { email: "a@b.c", name: "" } }), { email: "a@b.c" });
  assert.equal(accountFrom(null), null);
  assert.equal(accountFrom({ user: {} }), null);
});

check("the server's message beats the status code", () => {
  assert.equal(
    authFailure(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }),
    "Invalid email or password",
  );
  assert.equal(authFailure(500, null), "The Monochrome account server answered 500");
  assert.equal(authFailure(400, "<html>"), "The Monochrome account server answered 400");
});

check("player preferences default to headless mpv in its own cache", () => {
  const config = buildConfig({}, "/home/tester", {});
  assert.equal(config.player, "mpv");
  assert.deepEqual(config.playerArgs, []);
  assert.equal(config.window, false);
  assert.equal(config.cacheDir, "/home/tester/.cache/monochrome");
  assert.equal(config.downloadDir, "/home/tester/Music/Monochrome");
  assert.equal(
    buildConfig({ downloadDir: "~/Music/Flac" }, "/home/tester", {}).downloadDir,
    "/home/tester/Music/Flac",
  );

  const quoted = buildConfig(
    { player: " mpv ", playerArgs: '--title="a b" --vf crop=1:1', playerWindow: true },
    "/home/tester",
    { XDG_CACHE_HOME: "/cache" },
  );
  assert.equal(quoted.player, "mpv");
  assert.deepEqual(quoted.playerArgs, ["--title=a b", "--vf", "crop=1:1"]);
  assert.equal(quoted.window, true);
  assert.equal(quoted.cacheDir, "/cache/monochrome");
});

check("a podcast search keeps the feeds it can open", () => {
  const podcasts = parsePodcasts(fixture("podcast-search.json"));
  assert.deepEqual(
    podcasts.map((podcast) => [podcast.id, podcast.title, podcast.author, podcast.episodeCount]),
    [
      [920666, "Darknet Diaries", "Jack Rhysider", 168],
      [3254239, "Search Off the Record", "Google Search Relations", 60],
    ],
  );
  assert.equal(podcasts[0]?.artwork, "https://megaphone.imgix.net/podcasts/feed.jpg");
  assert.deepEqual(parsePodcasts(null), []);
});

check("an episode without an enclosure is dropped", () => {
  const episodes = parseEpisodes(fixture("podcast-episodes.json"));
  assert.deepEqual(
    episodes.map((episode) => [episode.id, episode.title, episode.audio]),
    [
      [16825781, "Ep 1: The Internet", "https://traffic.megaphone.fm/ep1.mp3"],
      [16825783, "Feed image only", "https://traffic.megaphone.fm/ep3.mp3"],
    ],
  );
  assert.equal(episodes[0]?.duration, 3600);
  assert.equal(episodes[0]?.published, "2020-09-13");
  assert.equal(episodes[0]?.podcastId, 920666);
  assert.equal(episodes[1]?.artwork, "https://megaphone.imgix.net/feed.jpg");
});

check("PodcastIndex auth signs the key, the secret and the date with SHA-1", () => {
  assert.deepEqual(podcastAuth("a", "b", 1), {
    "X-Auth-Key": "a",
    "X-Auth-Date": "1",
    Authorization: "e175ea4ce0a553260a14bc5e922a935b40425c1e",
  });
});

check("a download path carries the artist, the album and the track number", () => {
  const track = {
    id: "1",
    title: "Everything In Its Right Place",
    artists: ["Radiohead"],
    trackNumber: 1,
    playable: true,
  };
  assert.equal(
    trackPath(track, "/music", "Kid A"),
    "/music/Radiohead/Kid A/01 Everything In Its Right Place.flac",
  );
  assert.equal(trackPath({ ...track, trackNumber: undefined, title: "Creep/2" }, "/music"), "/music/Radiohead/Creep_2.flac");
  assert.equal(safeName("   "), "Untitled");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
