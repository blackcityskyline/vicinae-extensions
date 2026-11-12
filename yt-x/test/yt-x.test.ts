import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendSearchHistory,
  clearSearchHistory,
  forgetPlaylist,
  forgetVideo,
  readCustomCommands,
  readLibrary,
  readSearchHistory,
  saveCustomCommand,
  savePlaylist,
  saveVideo,
  updateRecent,
} from "../src/api/library.ts";
import { archivePath, downloadArgs, playArgs, playlistDownloadArgs } from "../src/api/player.ts";
import type { Entry } from "../src/types.ts";
import { buildConfig, expandHome, parseAssignments } from "../src/utils/config.ts";
import { applySearchFilters, expandHistoryRecall, searchUrl } from "../src/utils/search.ts";
import { splitWords } from "../src/utils/shell-words.ts";
import {
  channelSearchUrl,
  channelTabUrl,
  channelUrlOf,
  formatCount,
  formatDuration,
  formatPublished,
  mixUrl,
  parseCustomCommands,
  parseEntries,
  parsePlaylists,
  playlistIdOf,
  thumbnailUrl,
} from "../src/utils/state.ts";
import { listArgs, parseChannelInfo, parseListing } from "../src/utils/ytdlp.ts";
import { cookieBrowserLine, cookieHeader, parseBrowserSpec, parseCookieRows, sapisidOf } from "../src/utils/cookies.ts";
import { clockSeconds, parseRelated } from "../src/utils/related.ts";

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

function tempDir(body: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "yt-x-test-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- shell words -----------------------------------------------------------

check("an empty argument string is no arguments", () => {
  assert.deepEqual(splitWords(""), []);
  assert.deepEqual(splitWords("   \n "), []);
});

check("unquoted words are split, quoted spaces are kept", () => {
  assert.deepEqual(splitWords('  --volume=50   --foo "a b"  '), ["--volume=50", "--foo", "a b"]);
  assert.deepEqual(splitWords("--title 'It runs'"), ["--title", "It runs"]);
});

check("an empty quoted argument survives", () => {
  assert.deepEqual(splitWords('--msg ""'), ["--msg", ""]);
});

check("escaped quotes and backslashes reach the program", () => {
  assert.deepEqual(splitWords("--title=it\\'s"), ["--title=it's"]);
  assert.deepEqual(splitWords('--filter \\"a b\\"'), ["--filter", '"a', 'b"']);
  assert.deepEqual(splitWords('--filter="a b"'), ["--filter=a b"]);
});

// --- config ----------------------------------------------------------------

const CONFIG = `# CONFIG_PLAYER=vlc
CONFIG_PLAYER="mpv"
CONFIG_MPV_ARGS="--volume=70 --title=\\"my video\\""
CONFIG_VLC_ARGS="--fullscreen"
CONFIG_YT_DLP_OPTS="--no-warnings --sleep-requests 1"
CONFIG_DOWNLOAD_DIR="$HOME/Videos/yt-x"
CONFIG_BROWSER="firefox"
CONFIG_PER_PAGE="12"
CONFIG_EDITOR="$EDITOR"
CONFIG_DOWNLOADS_ENUMERATE="true"
CONFIG_NO_OF_RECENT="7"
CONFIG_GUM_OPTS="--prompt.foreground #afc6ff --prompt >"
CONFIG_FZF_OPTS="
  --ansi
  --wrap"
`;

const HOME = "/home/tester";

check("assignments are read, comments skipped, variables left alone", () => {
  const values = parseAssignments(CONFIG);
  assert.equal(values.CONFIG_PLAYER, "mpv");
  assert.equal(values.CONFIG_DOWNLOAD_DIR, "$HOME/Videos/yt-x");
  assert.equal(values.CONFIG_EDITOR, "$EDITOR");
  assert.equal(values.CONFIG_GUM_OPTS, "--prompt.foreground #afc6ff --prompt >");
});

check("the values the extension uses come out resolved", () => {
  const config = buildConfig(parseAssignments(CONFIG), { HOME, EDITOR: "nano" });
  assert.equal(config.player, "mpv");
  assert.deepEqual(config.playerArgs, ["--volume=70", "--title=my video"]);
  assert.deepEqual(config.ytDlpOpts, ["--no-warnings", "--sleep-requests", "1"]);
  assert.equal(config.downloadDir, "/home/tester/Videos/yt-x");
  assert.equal(config.cookiesBrowser, "firefox");
  assert.equal(config.perPage, 12);
  assert.equal(config.noOfRecent, 7);
  assert.equal(config.enumerateDownloads, true);
  assert.equal(config.searchHistory, true);
  assert.equal(config.editor, "nano");
  assert.equal(config.configDir, "/home/tester/.config/yt-x");
  assert.equal(config.configHome, "/home/tester/.config");
  assert.equal(config.cacheDir, "/home/tester/.cache/yt-x");
});

check("YT_X_* wins over the file, including the player's own arguments", () => {
  const config = buildConfig(parseAssignments(CONFIG), {
    HOME,
    YT_X_PLAYER: "vlc",
    YT_X_DOWNLOAD_DIR: "/media/videos",
    YT_X_BROWSER: "brave",
  });
  assert.equal(config.player, "vlc");
  assert.deepEqual(config.playerArgs, ["--fullscreen"]);
  assert.equal(config.downloadDir, "/media/videos");
  assert.equal(config.cookiesBrowser, "brave");
});

check("the page size is clamped and junk falls back to 30", () => {
  const page = (value: string) => buildConfig({ CONFIG_PER_PAGE: value }, { HOME }).perPage;
  assert.equal(page("999"), 50);
  assert.equal(page("0"), 1);
  assert.equal(page("abc"), 30);
});

check("the recent limit and the two switches fall back to yt-x's defaults", () => {
  const config = (values: Record<string, string>) => buildConfig(values, { HOME, EDITOR: "nano" });
  assert.equal(config({ CONFIG_NO_OF_RECENT: "0" }).noOfRecent, 1);
  assert.equal(config({ CONFIG_NO_OF_RECENT: "junk" }).noOfRecent, 10);
  assert.equal(config({}).enumerateDownloads, false);
  assert.equal(config({ CONFIG_DOWNLOADS_ENUMERATE: "nonsense" }).enumerateDownloads, false);
  assert.equal(config({ CONFIG_ENABLE_SEARCH_HISTORY: "false" }).searchHistory, false);
});

check("the editor follows yt-x: config first, $EDITOR next, nothing last", () => {
  assert.equal(buildConfig({ CONFIG_EDITOR: "micro" }, { HOME }).editor, "micro");
  assert.equal(buildConfig({ CONFIG_EDITOR: "$EDITOR" }, { HOME, EDITOR: "nano" }).editor, "nano");
  assert.equal(buildConfig({ CONFIG_EDITOR: "$UNSET_EDITOR" }, { HOME }).editor, "");
});

check("the config and cache directories follow XDG and yt-x's app name", () => {
  const config = buildConfig({}, { HOME, XDG_CONFIG_HOME: "/tmp/xdg", XDG_CACHE_HOME: "/tmp/cache" });
  assert.equal(config.configDir, "/tmp/xdg/yt-x");
  assert.equal(config.cacheDir, "/tmp/cache/yt-x");
  assert.equal(
    buildConfig({}, { HOME, XDG_CONFIG_HOME: "/tmp/xdg", YT_X_APP_NAME: "ytx" }).configDir,
    "/tmp/xdg/ytx",
  );
});

check("a home-prefixed folder is expanded the way a shell would", () => {
  assert.equal(expandHome("~/Music", HOME), "/home/tester/Music");
  assert.equal(expandHome("$HOME/Music", HOME), "/home/tester/Music");
  assert.equal(expandHome("${HOME}", HOME), "/home/tester");
  assert.equal(expandHome("/absolute", HOME), "/absolute");
});

// --- search filters --------------------------------------------------------
// The ids are copied from yt-x 0.8.7's `_parse_search_filter`.

check("yt-x's filter ids are reproduced", () => {
  assert.deepEqual(applySearchFilters("lofi :today"), { term: "lofi", sp: "EgIIAg%253D%253D" });
  assert.deepEqual(applySearchFilters("lofi :4k"), { term: "lofi", sp: "EgJwAQ%253D%253D" });
  assert.deepEqual(applySearchFilters(":newest drum and bass"), { term: "drum and bass", sp: "CAISAhAB" });
  assert.deepEqual(applySearchFilters("drum and bass"), { term: "drum and bass", sp: "EgIQAQ%253D%253D" });
});

check("an unknown filter is part of the words", () => {
  assert.deepEqual(applySearchFilters("lofi :nope"), { term: "lofi :nope", sp: "EgIQAQ%253D%253D" });
  assert.deepEqual(applySearchFilters(":nope lofi"), { term: ":nope lofi", sp: "EgIQAQ%253D%253D" });
});

check("a lone filter keeps its text, as yt-x does", () => {
  assert.deepEqual(applySearchFilters(":today"), { term: ":today", sp: "EgIQAQ%253D%253D" });
});

check("a colon inside a word is not a filter", () => {
  assert.deepEqual(applySearchFilters("lofi:today"), { term: "lofi:today", sp: "EgIQAQ%253D%253D" });
});

check("history recall counts from the newest entry", () => {
  const history = ["oldest", "middle", "newest"];
  assert.equal(expandHistoryRecall("!1", history), "newest");
  assert.equal(expandHistoryRecall("!2 live", history), "middle live");
  assert.equal(expandHistoryRecall("!9", history), "!9");
  assert.equal(expandHistoryRecall("lofi", history), "lofi");
});

check("a search URL encodes the term and carries the filter", () => {
  assert.equal(
    searchUrl("drum & bass", "EgJwAQ%253D%253D"),
    "https://www.youtube.com/results?search_query=drum%20%26%20bass&sp=EgJwAQ%253D%253D",
  );
});

// --- state files -----------------------------------------------------------

check("yt-x's saved-videos shape becomes entries, junk dropped", () => {
  const text = JSON.stringify({
    entries: [
      {
        id: "a",
        title: "First",
        url: "https://www.youtube.com/watch?v=a",
        duration: 61.4,
        channel: "Chan",
        channel_id: "UC1",
        channel_url: "https://www.youtube.com/channel/UC1",
        view_count: 1234,
        timestamp: 1710000000,
        thumbnails: [{ url: "//i.ytimg.com/a.jpg", width: 480, height: 270 }],
      },
      { id: "b", title: "No url", duration: 10 },
      null,
    ],
  });

  const entries = parseEntries(text);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.title, "First");
  assert.equal(entries[0]!.duration, 61.4);
  assert.equal(entries[0]!.channelUrl, "https://www.youtube.com/channel/UC1");
  assert.equal(entries[0]!.viewCount, 1234);
  assert.equal(entries[0]!.publishedAt, 1710000000);
  assert.equal(thumbnailUrl(entries[0]!), "https://i.ytimg.com/a.jpg");
});

check("a missing or empty state file is an empty list; broken JSON is an error", () => {
  assert.deepEqual(parseEntries(undefined), []);
  assert.deepEqual(parseEntries(""), []);
  assert.throws(() => parseEntries("{\"entries\":["));
});

check("channel files accept the legacy field names", () => {
  const channels = parseEntries(
    JSON.stringify({
      entries: [
        { id: "UC1", channel: "One", channel_url: "https://www.youtube.com/channel/UC1" },
        { id: "UC2", title: "Two", url: "https://www.youtube.com/channel/UC2" },
      ],
    }),
  );
  assert.deepEqual(
    channels.map((channel) => channel.title),
    ["One", "Two"],
  );
  assert.equal(channelTabUrl("https://www.youtube.com/channel/UC1/", "videos"), "https://www.youtube.com/channel/UC1/videos");
});

check("custom playlists are a bare array and need a name and a url", () => {
  const playlists = parsePlaylists(
    JSON.stringify([
      { id: "x", name: "electronic cuts", url: "https://youtube.com/results?search_query=dnb" },
      { name: "", url: "https://example.com" },
      { name: "no url" },
    ]),
  );
  assert.deepEqual(playlists, [{ name: "electronic cuts", url: "https://youtube.com/results?search_query=dnb" }]);
});

check("custom commands keep the space separated yt-dlp options", () => {
  const commands = parseCustomCommands(
    JSON.stringify([
      { name: "Radio", url: "https://example.com/a", "yt-dlp-opts": "--no-warnings --playlist-end 5" },
      { name: "Plain", url: "https://example.com/b", "yt-dlp-opts": "" },
    ]),
  );
  assert.deepEqual(commands, [
    { name: "Radio", url: "https://example.com/a", opts: ["--no-warnings", "--playlist-end", "5"] },
    { name: "Plain", url: "https://example.com/b", opts: [] },
  ]);
});

check("durations read like a player shows them", () => {
  assert.equal(formatDuration(61), "1:01");
  assert.equal(formatDuration(3725), "1:02:05");
  assert.equal(formatDuration(null), undefined);
  assert.equal(formatDuration(-1), undefined);
});

check("view counts read like YouTube abbreviates them", () => {
  assert.equal(formatCount(999), "999");
  assert.equal(formatCount(1000), "1K");
  assert.equal(formatCount(20_949), "20.9K");
  assert.equal(formatCount(1_234_567), "1.2M");
  assert.equal(formatCount(2_500_000_000), "2.5B");
  assert.equal(formatCount(undefined), undefined);
});

check("a yt-dlp timestamp becomes a readable date", () => {
  assert.equal(formatPublished(1_710_000_000), "Mar 9, 2024");
  assert.equal(formatPublished(null), undefined);
});

check("the channel and mix URLs are built the way yt-x builds them", () => {
  assert.equal(
    channelSearchUrl("https://www.youtube.com/@chan/", "drum & bass"),
    "https://www.youtube.com/@chan/search?query=drum%20%26%20bass",
  );
  assert.equal(mixUrl("abc"), "https://www.youtube.com/watch?v=abc&list=RDabc");
  assert.equal(playlistIdOf("https://www.youtube.com/playlist?list=PL123&index=2"), "PL123");
  assert.equal(playlistIdOf("not a url"), "not a url");
});

// --- yt-dlp ----------------------------------------------------------------

const searchFixture = readFileSync(join(__dirname, "fixtures", "ytsearch.json"), "utf8");

check("a real yt-dlp search result becomes entries, unavailable ones skipped", () => {
  const { title, entries } = parseListing(searchFixture);
  assert.equal(title, "lofi hip hop");
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["rFZHOHl-L8A", "n61ULEU7CO0", "uWzSqdcfPZw"],
  );
  assert.equal(entries[0]!.channel, "Lofi Girl");
  assert.equal(entries[0]!.channelId, "UCSJ4gkVC6NrvII8umztf0Ow");
  assert.equal(entries[0]!.channelUrl, "https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow");
  assert.equal(channelUrlOf(entries[0]!), "https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow");
  assert.equal(entries[0]!.duration, undefined);
  assert.equal(entries[0]!.liveStatus, "is_live");
  assert.equal(entries[0]!.concurrentViewCount, 20_949);
  assert.equal(entries[1]!.duration, 22258);
  assert.equal(formatDuration(entries[1]!.duration), "6:10:58");
  assert.match(thumbnailUrl(entries[0]!) ?? "", /^https:\/\//);
});

const channelFixture = readFileSync(join(__dirname, "fixtures", "channel.json"), "utf8");

check("a real channel listing's header becomes the channel row", () => {
  const channel = parseChannelInfo(channelFixture);
  assert.equal(channel?.title, "Lofi Girl");
  assert.equal(channel?.url, "https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow");
  assert.equal(channel?.channelId, "UCSJ4gkVC6NrvII8umztf0Ow");
  assert.equal(channel?.followerCount, 15_800_000);
  assert.equal(formatCount(channel?.followerCount), "15.8M");
  assert.match(channel?.description ?? "", /Lofi House/);
  // the pane's thumbnail is the avatar, not one of the banner crops
  const avatar = channel?.thumbnails?.find((thumbnail) => thumbnail.width === 1060);
  assert.ok(avatar);
  const shown = thumbnailUrl(channel!) ?? "";
  assert.match(shown, /^https:\/\/yt3\.googleusercontent\.com\//);
  assert.notEqual(shown.split("=")[0], avatar.url.split("=")[0]);
});

check("the listing command mirrors yt-x's yt-dlp call, page and opts included", () => {
  const config = buildConfig(
    { CONFIG_YT_DLP_OPTS: "--no-warnings", CONFIG_PER_PAGE: "5", CONFIG_BROWSER: "firefox" },
    { HOME },
  );
  assert.deepEqual(listArgs("ytsearch5:lofi", config), [
    "--cookies-from-browser",
    "firefox",
    "--no-warnings",
    "--dump-single-json",
    "--flat-playlist",
    "--playlist-start",
    "1",
    "--playlist-end",
    "5",
    "--extractor-args",
    "youtubetab:approximate_date",
    "ytsearch5:lofi",
  ]);
  assert.deepEqual(
    listArgs("https://example.com/list", buildConfig({}, { HOME }), {
      start: 31,
      end: 60,
      extraOpts: ["--playlist-end", "5"],
    }),
    [
      "--dump-single-json",
      "--flat-playlist",
      "--playlist-start",
      "31",
      "--playlist-end",
      "60",
      "--extractor-args",
      "youtubetab:approximate_date",
      "--playlist-end",
      "5",
      "https://example.com/list",
    ],
  );
});

// --- playback and downloads ------------------------------------------------

check("play is yt-x's mpv command, and listen adds its flags", () => {
  const config = buildConfig({ CONFIG_MPV_ARGS: '--volume=70 "a b"' }, { HOME });
  assert.deepEqual(playArgs("https://youtu.be/x", false, config), ["https://youtu.be/x", "--volume=70", "a b"]);
  assert.deepEqual(playArgs("https://youtu.be/x", true, config), [
    "https://youtu.be/x",
    "--volume=70",
    "a b",
    "--no-video",
    "--force-window=no",
  ]);
});

check("a single download uses yt-x's layout, cookies and mp3 conversion only", () => {
  const config = buildConfig(
    { CONFIG_DOWNLOAD_DIR: "/videos", CONFIG_BROWSER: "firefox", CONFIG_YT_DLP_OPTS: "--no-warnings" },
    { HOME },
  );
  assert.deepEqual(downloadArgs("https://youtu.be/x", "video", config), [
    "https://youtu.be/x",
    "--cookies-from-browser",
    "firefox",
    "--output",
    "/videos/video/individual/%(channel)s/%(title)s.%(ext)s",
  ]);
  assert.deepEqual(downloadArgs("https://youtu.be/x", "audio", config), [
    "https://youtu.be/x",
    "--cookies-from-browser",
    "firefox",
    "--extract-audio",
    "--audio-format",
    "mp3",
    "--output",
    "/videos/audio/individual/%(channel)s/%(title)s.%(ext)s",
  ]);
});

check("a playlist download gets a named folder, an archive and the enumerate prefix", () => {
  const config = buildConfig({ CONFIG_DOWNLOAD_DIR: "/videos" }, { HOME });
  const args = playlistDownloadArgs("https://youtu.be/x", "My List", "video", config);
  assert.deepEqual(args.slice(0, 2), ["https://youtu.be/x", "--output"]);
  assert.equal(args[2], "/videos/video/My List/%(channel)s/%(title)s.%(ext)s");
  const archive = "/home/tester/.cache/yt-x/archives/08e9d69dea5e15b08be066c2798fc641a947d6fbf044a507c5db50c543d82200";
  assert.deepEqual(args.slice(3), ["--download-archive", archive]);
  assert.equal(archivePath("https://youtu.be/x", "video", config), archive);
  assert.notEqual(archivePath("https://youtu.be/x", "audio", config), archive);

  const enumerated = buildConfig({ CONFIG_DOWNLOAD_DIR: "/videos", CONFIG_DOWNLOADS_ENUMERATE: "true" }, { HOME });
  assert.equal(
    playlistDownloadArgs("https://youtu.be/x", "My List", "video", enumerated)[2],
    "/videos/video/My List/%(channel)s/%(playlist_index)s - %(title)s.%(ext)s",
  );
});

// --- reading and writing yt-x's library -----------------------------------

function video(id: string, title: string): Entry {
  return { id, title, url: `https://www.youtube.com/watch?v=${id}` };
}

check("saving appends once, newest last, and reads back newest first", () => {
  tempDir((dir) => {
    saveVideo(video("a", "A"), dir);
    saveVideo(video("b", "B"), dir);
    saveVideo(video("a", "A again"), dir);

    const stored = JSON.parse(readFileSync(join(dir, "my", "videos.json"), "utf8")) as {
      entries: { id: string; title: string }[];
    };
    assert.deepEqual(
      stored.entries.map((entry) => entry.id),
      ["b", "a"],
    );
    assert.equal(stored.entries[1]!.title, "A again");

    const { library, problem } = readLibrary(dir);
    assert.equal(problem, null);
    assert.deepEqual(
      library.saved.map((entry) => entry.id),
      ["a", "b"],
    );
  });
});

check("saved entries keep the fields the detail pane shows", () => {
  tempDir((dir) => {
    saveVideo({ ...video("a", "A"), viewCount: 1234, publishedAt: 1_710_000_000 }, dir);
    const [entry] = readLibrary(dir).library.saved;
    assert.equal(entry!.viewCount, 1234);
    assert.equal(entry!.publishedAt, 1_710_000_000);
  });
});

check("the legacy saved list is read until the current file exists", () => {
  tempDir((dir) => {
    writeFileSync(
      join(dir, "saved-videos.json"),
      JSON.stringify({ entries: [{ id: "old", title: "Old", url: "https://youtu.be/old" }] }),
    );

    assert.deepEqual(
      readLibrary(dir).library.saved.map((entry) => entry.id),
      ["old"],
    );

    saveVideo(video("new", "New"), dir);
    assert.deepEqual(
      readLibrary(dir).library.saved.map((entry) => entry.id),
      ["new", "old"],
    );

    forgetVideo("old", dir);
    const legacy = JSON.parse(readFileSync(join(dir, "saved-videos.json"), "utf8")) as { entries: unknown[] };
    assert.deepEqual(legacy.entries, []);
  });
});

check("recents keep the configured number and move a replay to the end", () => {
  tempDir((dir) => {
    for (const id of ["a", "b", "c", "a", "d"]) updateRecent(video(id, id), dir, 3);

    const stored = JSON.parse(readFileSync(join(dir, "my", "recents.json"), "utf8")) as {
      entries: { id: string }[];
    };
    assert.deepEqual(
      stored.entries.map((entry) => entry.id),
      ["c", "a", "d"],
    );
    assert.deepEqual(
      readLibrary(dir).library.recent.map((entry) => entry.id),
      ["d", "a", "c"],
    );
  });
});

check("saving and removing a playlist writes yt-x's array shape and legacy file", () => {
  tempDir((dir) => {
    writeFileSync(
      join(dir, "custom-playlists.json"),
      JSON.stringify([{ id: "PLOLD", name: "Old", url: "https://youtube.com/playlist?list=PLOLD" }]),
    );

    savePlaylist({ id: "PLNEW", name: "New", url: "https://youtube.com/playlist?list=PLNEW" }, dir);
    const saved = JSON.parse(readFileSync(join(dir, "my", "playlists.json"), "utf8")) as {
      id: string;
      name: string;
    }[];
    assert.deepEqual(
      saved.map((entry) => entry.name),
      ["Old", "New"],
    );

    forgetPlaylist("https://youtube.com/playlist?list=PLOLD", dir);
    assert.deepEqual(readLibrary(dir).library.playlists.map((entry) => entry.name), ["New"]);
    const legacy = JSON.parse(readFileSync(join(dir, "custom-playlists.json"), "utf8")) as unknown[];
    assert.deepEqual(legacy, []);
  });
});

check("search history replaces typing prefixes, drops exact duplicates and caps at 100", () => {
  tempDir((dir) => {
    appendSearchHistory("drum", dir);
    appendSearchHistory("drum and", dir);
    appendSearchHistory("drum and bass", dir);
    assert.deepEqual(readSearchHistory(dir), ["drum and bass"]);

    appendSearchHistory("lofi", dir);
    appendSearchHistory("drum and bass", dir);
    assert.deepEqual(readSearchHistory(dir), ["lofi", "drum and bass"]);

    for (let index = 0; index < 105; index++) appendSearchHistory(`item-${String(index).padStart(3, "0")}`, dir);
    const lines = readSearchHistory(dir);
    assert.equal(lines.length, 100);
    assert.equal(lines[99], "item-104");
    assert.equal(lines[0], "item-005");

    clearSearchHistory(dir);
    assert.deepEqual(readSearchHistory(dir), []);
  });
});

check("a custom command round-trips through my/cmds.json", () => {
  tempDir((dir) => {
    saveCustomCommand({ name: "Radio", url: "https://example.com/a", opts: ["--no-warnings"] }, dir);
    saveCustomCommand({ name: "Plain", url: "https://example.com/b", opts: [] }, dir);
    assert.deepEqual(readCustomCommands(dir), [
      { name: "Radio", url: "https://example.com/a", opts: ["--no-warnings"] },
      { name: "Plain", url: "https://example.com/b", opts: [] },
    ]);

    saveCustomCommand({ name: "Radio", url: "https://example.com/c", opts: [] }, dir);
    assert.deepEqual(
      readCustomCommands(dir).map((command) => command.url),
      ["https://example.com/b", "https://example.com/c"],
    );
  });
});

check("a corrupt state file is reported, not silently dropped", () => {
  tempDir((dir) => {
    mkdirSync(join(dir, "my"));
    writeFileSync(join(dir, "my", "recents.json"), "{\"entries\":[");
    const { library, problem } = readLibrary(dir);
    assert.deepEqual(library.recent, []);
    assert.match(problem ?? "", /Recent videos/);
  });
});

const relatedFixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "related.json"), "utf8"),
) as unknown;

check("the related column becomes rows", () => {
  const related = parseRelated(relatedFixture);
  assert.deepEqual(
    related.map((video) => [video.id, video.title, video.channel, video.duration]),
    [
      ["yPYZpwSpKmA", "Rick Astley - Together Forever (Official Video) [4K Remaster]", "Rick Astley", 204],
      ["I_izvAbhExY", "Bee Gees - Stayin' Alive (Official Video)", "beegees", 250],
      ["830xqI0Qwas", "TOP GUN | Danger Zone (Extended Version) | 4K Tribute", "Spectra Cut", 466],
    ],
  );
  assert.equal(related[0]?.url, "https://www.youtube.com/watch?v=yPYZpwSpKmA");
  assert.equal(related[0]?.thumbnails?.[0]?.width, 168);
});

check("a related reply keeps only videos it can name", () => {
  const reply = (results: unknown[]) => ({
    contents: { twoColumnWatchNextResults: { secondaryResults: { secondaryResults: { results } } } },
  });
  const playlist = {
    lockupViewModel: {
      contentId: "PL123",
      contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST",
      metadata: { lockupMetadataViewModel: { title: { content: "A mix" } } },
    },
  };
  const nameless = { lockupViewModel: { contentId: "", contentType: "LOCKUP_CONTENT_TYPE_VIDEO" } };
  assert.deepEqual(parseRelated(reply([playlist, nameless, null])), []);
  assert.deepEqual(parseRelated(null), []);
});

check("the browser spec names the profile and skips the keyring", () => {
  assert.deepEqual(parseBrowserSpec("firefox"), { browser: "firefox" });
  assert.deepEqual(parseBrowserSpec("firefox+gnomekeyring:~/zen/a::work"), {
    browser: "firefox",
    profile: "~/zen/a",
  });
  assert.equal(parseBrowserSpec("  "), null);
});

check("yt-dlp's config names the browser, comments do not", () => {
  const config = [
    "# --cookies-from-browser brave",
    "--cookies-from-browser=firefox:~/.config/zen/'a b'",
    "--format best",
  ].join("\n");
  assert.equal(cookieBrowserLine(config), "firefox:~/.config/zen/a b");
  assert.equal(cookieBrowserLine('--cookies-from-browser "chromium:/p"\n'), "chromium:/p");
  assert.equal(cookieBrowserLine("--format best\n"), undefined);
});

check("a cookie header keeps one value per name and finds SAPISID", () => {
  const rows = parseCookieRows("SID\tone\n__Secure-1PAPISID\tx\nSID\ttwo\nVISITOR\t3\n");
  const header = cookieHeader(rows);
  assert.equal(header, "SID=two; __Secure-1PAPISID=x; VISITOR=3");
  assert.equal(sapisidOf(header), undefined);
  assert.equal(sapisidOf("SID=1; SAPISID=abc; VISITOR=3"), "abc");
  assert.deepEqual(parseCookieRows("not a pair"), []);
});

check("a duration badge becomes seconds", () => {
  assert.equal(clockSeconds("3:24"), 204);
  assert.equal(clockSeconds("1:02:03"), 3723);
  assert.equal(clockSeconds("Now playing"), undefined);
  assert.equal(clockSeconds("3:24:5:1"), undefined);
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
