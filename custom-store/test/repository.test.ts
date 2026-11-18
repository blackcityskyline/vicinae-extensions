import assert from "node:assert/strict";

import {
  allSources,
  expandHome,
  indexUrl,
  isSafeId,
  manifestEntry,
  mergeEntries,
  parseIndex,
  sourceKind,
  sourceKindLabel,
  type PackageEntry,
} from "../src/utils/repository.ts";

/**
 * The repository format is ours, so there is no upstream to check against. What
 * these checks fix is the contract the installer relies on: a row exists only if
 * it can be installed, and every archive and icon is an absolute URL by the time
 * the view sees it.
 */

let passed = 0;
let failed = 0;
function check(name: string, body: () => void) {
  try {
    body();
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

check("a directory, a trailing slash and the index itself name the same file", () => {
  assert.equal(indexUrl("https://example.com/repo"), "https://example.com/repo/index.json");
  assert.equal(indexUrl("https://example.com/repo/"), "https://example.com/repo/index.json");
  assert.equal(indexUrl("https://example.com/repo/index.json"), "https://example.com/repo/index.json");
  assert.equal(indexUrl("  https://example.com/repo  "), "https://example.com/repo/index.json");
});

check("a path is a folder, an index URL is an index, a hosted repository is cloned", () => {
  assert.equal(sourceKind("~/extensions-repo"), "local");
  assert.equal(sourceKind("/srv/extensions"), "local");
  assert.equal(sourceKind("https://example.com/repo"), "index");
  assert.equal(sourceKind("https://example.com/repo/index.json"), "index");
  assert.equal(sourceKind("HTTP://example.com/repo"), "index");
  assert.equal(sourceKind("https://you.github.io/store/index.json"), "index", "Pages serves the file");
  assert.equal(sourceKind("https://github.com/you/store"), "git");
  assert.equal(sourceKind("https://gitlab.com/group/sub/store/"), "git");
  assert.equal(sourceKind("https://codeberg.org/you/store"), "git");
  assert.equal(sourceKind("https://bitbucket.org/you/store"), "git");
  assert.equal(sourceKind("https://git.example.com/you/store.git"), "git");
  assert.equal(sourceKind("git@github.com:you/store.git"), "git");
  assert.equal(sourceKind("ssh://git@git.example.com/you/store"), "git");
  assert.equal(sourceKind("file:///srv/store.git"), "git");
});

check("the source kind is what the sources page says it is", () => {
  assert.equal(sourceKindLabel("~/extensions-repo"), "Local folder");
  assert.equal(sourceKindLabel("https://example.com/repo/index.json"), "Index URL");
  assert.equal(sourceKindLabel("https://github.com/you/store"), "Git repository");
});

check("the preference comes first, then the added sources, without duplicates", () => {
  assert.deepEqual(allSources("~/repo", []), ["~/repo"]);
  assert.deepEqual(
    allSources("~/repo", ["https://github.com/you/store", "~/repo", "   ", " https://github.com/you/store "]),
    ["~/repo", "https://github.com/you/store"],
  );
  assert.deepEqual(allSources("", ["~/srv/repo"]), ["~/srv/repo"]);
  assert.deepEqual(allSources("", []), []);
});

check("the same extension from two sources is one row, and the earlier source wins", () => {
  function entry(id: string, title: string, origin: string): PackageEntry {
    return {
      id,
      title,
      description: `${title}.`,
      categories: [],
      platforms: [],
      commands: [],
      source: "local",
      origin,
      installed: false,
    };
  }

  const merged = mergeEntries([
    entry("player-pilot", "Player Pilot", "/preference/player-pilot"),
    entry("zebra", "Zebra", "/preference/zebra"),
    entry("player-pilot", "Player Pilot", "/added/player-pilot"),
  ]);

  assert.deepEqual(
    merged.map((item) => `${item.id}@${item.origin}`),
    ["player-pilot@/preference/player-pilot", "zebra@/preference/zebra"],
    "deduplicated by id and sorted by title",
  );
});

check("a relative archive and icon resolve against the index", () => {
  const entries = parseIndex(
    JSON.stringify({
      extensions: [
        {
          name: "player-pilot",
          title: "Player Pilot",
          description: "Control every running media player.",
          author: "black",
          icon: "icons/player-pilot.png",
          archive: "player-pilot.zip",
        },
      ],
    }),
    "https://example.com/repo/index.json",
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.origin, "https://example.com/repo/player-pilot.zip");
  assert.equal(entries[0]?.icon, "https://example.com/repo/icons/player-pilot.png");
  assert.equal(entries[0]?.source, "remote");
  assert.equal(entries[0]?.installed, false);
});

check("a remote entry carries what the detail page renders", () => {
  const entries = parseIndex(
    JSON.stringify({
      extensions: [
        {
          name: "player-pilot",
          title: "Player Pilot",
          description: "Control every running media player.",
          author: "black",
          icon: "icons/player-pilot.png",
          archive: "player-pilot.zip",
          avatar: "https://example.com/black.png",
          readme: "docs/README.md",
          source: "https://example.com/src",
          downloads: 1234,
          categories: ["Media", 7, " "],
          platforms: ["Linux"],
          commands: [{ title: "Player Pilot", description: "Control players." }, { name: "no-title" }],
        },
      ],
    }),
    "https://example.com/repo/index.json",
  );

  assert.deepEqual(entries[0]?.categories, ["Media"]);
  assert.deepEqual(entries[0]?.platforms, ["Linux"]);
  assert.deepEqual(entries[0]?.commands, [{ title: "Player Pilot", description: "Control players." }]);
  assert.equal(entries[0]?.downloads, 1234);
  assert.equal(entries[0]?.avatar, "https://example.com/black.png");
  assert.equal(entries[0]?.readme, "https://example.com/repo/docs/README.md");
  assert.equal(entries[0]?.sourceUrl, "https://example.com/src");
});

check("a missing download count stays missing, a string one is not a count", () => {
  const entries = parseIndex(
    JSON.stringify({
      extensions: [
        { name: "a", title: "A", description: "A.", archive: "a.zip" },
        { name: "b", title: "B", description: "B.", archive: "b.zip", downloads: "1234" },
      ],
    }),
    "https://example.com/repo/index.json",
  );
  assert.equal(entries[0]?.downloads, undefined);
  assert.equal(entries[1]?.downloads, undefined);
});

check("an absolute archive is left alone", () => {
  const entries = parseIndex(
    JSON.stringify({
      extensions: [
        {
          name: "x",
          title: "X",
          description: "An extension.",
          archive: "https://cdn.example.com/x.zip",
        },
      ],
    }),
    "https://example.com/repo/index.json",
  );
  assert.equal(entries[0]?.origin, "https://cdn.example.com/x.zip");
  assert.equal(entries[0]?.icon, undefined);
});

check("a row that cannot be installed is not shown", () => {
  const entries = parseIndex(
    JSON.stringify({
      extensions: [
        { name: "no-archive", title: "No Archive", description: "Nothing to fetch." },
        { name: "no-title", description: "Nothing to show.", archive: "a.zip" },
        { name: "no-description", title: "No Description", archive: "a.zip" },
        { name: "ok", title: "Ok", description: "Fine.", archive: "ok.zip" },
      ],
    }),
    "https://example.com/repo/index.json",
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["ok"],
  );
});

check("an index without the array is an error, not an empty store", () => {
  assert.throws(() => parseIndex("{}", "https://example.com/repo/index.json"), /extensions array/);
  assert.throws(() => parseIndex("not json", "https://example.com/repo/index.json"));
});

check("a local bundle takes its identity from package.json", () => {
  const entry = manifestEntry(
    {
      name: "player-pilot",
      title: "Player Pilot",
      description: "Players.",
      author: "black",
      categories: ["Media"],
      platforms: ["Linux"],
      commands: [{ title: "Player Pilot", description: "Control players." }],
    },
    { dir: "/repo/player-pilot", icon: "/repo/player-pilot/assets/icon.png" },
    true,
  );

  assert.equal(entry?.id, "player-pilot");
  assert.equal(entry?.origin, "/repo/player-pilot");
  assert.equal(entry?.icon, "/repo/player-pilot/assets/icon.png");
  assert.deepEqual(entry?.categories, ["Media"]);
  assert.deepEqual(entry?.platforms, ["Linux"]);
  assert.deepEqual(entry?.commands, [{ title: "Player Pilot", description: "Control players." }]);
  assert.equal(entry?.downloads, undefined, "a local bundle has no download count");
  assert.equal(entry?.source, "local");
  assert.equal(entry?.installed, true);
});

check("a bundle without a name or a description is not listed", () => {
  assert.equal(manifestEntry({ name: "x", title: "X" }, { dir: "/repo/x" }, false), undefined);
  assert.equal(manifestEntry({ title: "X", description: "Y" }, { dir: "/repo/x" }, false), undefined);
  assert.equal(manifestEntry(null, { dir: "/repo/x" }, false), undefined);
});

check("an id that would escape the extensions directory is refused", () => {
  assert.equal(isSafeId("player-pilot"), true);
  assert.equal(isSafeId("store.vicinae.coffee"), true);
  assert.equal(isSafeId("../../.config/autostart"), false);
  assert.equal(isSafeId("/etc/cron.d/x"), false);
  assert.equal(isSafeId(".."), false, "the id becomes a directory name");
  assert.equal(isSafeId(".staging-x"), false, "a package cannot claim the staging prefix");
  assert.equal(isSafeId(""), false);
});

check("a leading ~ is the home directory, anything else is untouched", () => {
  assert.equal(expandHome("~/repo", "/home/black"), "/home/black/repo");
  assert.equal(expandHome("~", "/home/black"), "/home/black");
  assert.equal(expandHome("/srv/repo", "/home/black"), "/srv/repo");
  assert.equal(expandHome("  /srv/repo  ", "/home/black"), "/srv/repo");
  assert.equal(expandHome("~other/repo", "/home/black"), "~other/repo");
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
