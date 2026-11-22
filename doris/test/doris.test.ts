import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DorisMissingError,
  changedSources,
  downloadArgs,
  firstLine,
  listSources,
  listTorrents,
  magnetFor,
  play,
  playArgs,
  parseTorrServerHealth,
  resolveSourceUrl,
  storageOffArgs,
  storageSetArgs,
  torrServerStorage,
  search,
  setSourceEnabled,
  sourceArgs,
  type Source,
  type TrackedRow,
} from "../src/api/doris.ts";
import {
  absoluteTorrentUrl,
  torrentFileName,
} from "../src/torrent-file.ts";
import { serviceArgs, serviceFailure } from "../src/torrserver-service.ts";
import {
  escapeMarkdown,
  fileListMarkdown,
  formatBytes,
  isRunning,
  progressPercent,
  torrentSubtitle,
} from "../src/utils/format.ts";
import { filterBySources, sortRows } from "../src/utils/rows.ts";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

/** A stand-in for the CLI: fixed stdout and exit code, no network. */
function fakeDoris(stdout: string, exitCode = 0, stderr = ""): string {
  const dir = mkdtempSync(join(tmpdir(), "doris-ext-"));
  const path = join(dir, "doris");
  writeFileSync(path, `#!/bin/sh\ncat <<'OUT'\n${stdout}\nOUT\ncat >&2 <<'ERR'\n${stderr}\nERR\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
  return path;
}

function recordingDoris(): { bin: string; args: () => string[] } {
  const dir = mkdtempSync(join(tmpdir(), "doris-ext-"));
  const bin = join(dir, "doris");
  const record = join(dir, "args");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\necho '[]'\n`);
  chmodSync(bin, 0o755);
  return { bin, args: () => readFileSync(record, "utf8").trim().split("\n") };
}

function sleepingDoris(): string {
  const dir = mkdtempSync(join(tmpdir(), "doris-ext-"));
  const bin = join(dir, "doris");
  writeFileSync(bin, "#!/bin/sh\nsleep 5\necho '[]'\n");
  chmodSync(bin, 0o755);
  return bin;
}

const registry: Source = {
  id: "",
  label: "",
  home: "",
  groups: [],
  browser: false,
  implemented: true,
  enabled: false,
};

const row: TrackedRow = {
  title: "The Dunes (2021) [1080p web]",
  size: "1.61 GB",
  seeds: "1",
  date: "2022-08-11",
  source: "yts",
  download_url: "",
  page_url: "https://yts.gg/movies/the-dunes-2021",
  uploader: "",
  category: "",
  group: "Movies",
  info_hash: "4f93d9c160adaac4248b123e9440523c0208bf92",
  magnet: "magnet:?xt=urn:btih:4f93d9c160adaac4248b123e9440523c0208bf92",
  size_bytes: 1728724337,
  seeds_n: 1,
  leechers: 2,
};

async function main(): Promise<void> {
  await check("formatBytes agrees with doris's human byte units", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(841482240), "802.5 MB");
    assert.equal(formatBytes(3653844165), "3.4 GB");
  });

  await check("progressPercent clamps to 0-100 and survives a zero total", () => {
    assert.equal(progressPercent(0, 100), 0);
    assert.equal(progressPercent(50, 200), 25);
    assert.equal(progressPercent(300, 200), 100);
    assert.equal(progressPercent(5, 0), 0);
  });

  await check("isRunning reads the status TorrServer really sends", () => {
    // Measured on TorrServer MatriX.150: drop -> "Torrent in db", get ->
    // "Torrent working". "Torrent closed" is doris's own optimistic row and
    // never comes back from the server.
    assert.equal(isRunning("Torrent working"), true);
    assert.equal(isRunning("Torrent in db"), false);
    assert.equal(isRunning("Torrent closed"), false);
    assert.equal(isRunning(""), false);
  });

  await check("a row plays and downloads as the row the CLI printed", () => {
    // The CLI resolves the row it was given: magnet, .torrent link, page and
    // the source that fetches it. Nothing here picks a magnet or an index.
    for (const [verb, build] of [
      ["play", playArgs],
      ["download", downloadArgs],
    ] as const) {
      const args = build(row);
      assert.deepEqual(args.slice(0, 3), ["--json", verb, "--row"]);
      assert.equal(args.length, 4, "one argv entry carries the row");
      assert.deepEqual(JSON.parse(args[3] ?? ""), row);
    }
  });

  await check("a row without a magnet still travels as itself", () => {
    const rutracker = { ...row, source: "rutracker", magnet: null, info_hash: "", download_url: "dl.php?t=6306464" };
    const args = playArgs(rutracker);
    assert.deepEqual(JSON.parse(args[3] ?? ""), rutracker);
    assert.ok(!args.includes("--index"), "no index into a list that may move");
  });

  await check("magnetFor builds the bare info-hash magnet the CLI accepts", () => {
    assert.equal(
      magnetFor("13ae31f99028838112f12773d4b3b96797bb287b"),
      "magnet:?xt=urn:btih:13ae31f99028838112f12773d4b3b96797bb287b",
    );
  });

  await check("firstLine skips blank lines and leading whitespace", () => {
    assert.equal(firstLine("\n  Error: torrserver unreachable\nCaused by:\n x"), "Error: torrserver unreachable");
    assert.equal(firstLine("   \n\n"), "");
  });

  await check("torrentSubtitle says paused and shows a live rate", () => {
    const base = {
      name: "Movie",
      hash: "h",
      totalSize: 200,
      loadedSize: 50,
      downloadSpeed: 0,
      uploadSpeed: 0,
      activePeers: 3,
      seeders: 4,
      status: "Torrent working",
      files: [],
    };
    assert.equal(torrentSubtitle(base), "Torrent working · 25.0% · 4 seeds");
    assert.equal(
      torrentSubtitle({ ...base, status: "Torrent in db", downloadSpeed: 2048 }),
      "Torrent in db · 25.0% · ↓ 2.0 KB/s · 4 seeds",
    );
  });

  await check("fileListMarkdown sorts the largest file first and escapes the title", () => {
    const markdown = fileListMarkdown("Movie [2021]", [
      { id: 1, path: "sample.mkv", length: 10 },
      { id: 2, path: "Movie [2021].mkv", length: 2048 },
    ]);
    assert.equal(markdown.split("\n")[0], "# Movie \\[2021\\]");
    assert.ok(markdown.indexOf("2.0 KB") < markdown.indexOf("10 B"));
    assert.equal(escapeMarkdown("[a_b].mkv"), "\\[a\\_b\\]\\.mkv");
    assert.equal(
      fileListMarkdown("Empty", []),
      "# Empty\n\n_This torrent reports no files._",
    );
  });

  await check("search treats the CLI's exit 1 + [] as an empty answer", async () => {
    const batches: TrackedRow[][] = [];
    await search(fakeDoris("[]", 1, "rutor: timed out (10s)"), "", (rows) =>
      batches.push(rows),
    );
    assert.deepEqual(batches, []);
  });

  await check("search asks for one answer per source", async () => {
    const fake = recordingDoris();
    const batches: TrackedRow[][] = [];
    await search(fake.bin, "dune", (rows) => batches.push(rows));
    assert.deepEqual(fake.args(), ["--json", "search", "--stream", "dune"]);
    assert.deepEqual(batches, []);
  });

  await check("a slow tracker does not hold back the rows that already arrived", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doris-ext-"));
    const bin = join(dir, "doris");
    // Three answers, a real second apart in total: the reader must be handed
    // each one when it is printed, not all three when the process exits.
    writeFileSync(
      bin,
      [
        "#!/bin/sh",
        `echo '[{"title":"first"}]'`,
        "sleep 0.6",
        `echo '[{"title":"second"}]'`,
        "sleep 0.6",
        `echo '[{"title":"third"}]'`,
        "",
      ].join("\n"),
    );
    chmodSync(bin, 0o755);
    const titles: string[] = [];
    const stamps: number[] = [];
    const started = Date.now();
    await search(bin, "x", (rows) => {
      titles.push(rows[0]?.title ?? "");
      stamps.push(Date.now() - started);
    });
    assert.deepEqual(titles, ["first", "second", "third"]);
    assert.ok(stamps[0]! < 600, `first batch took ${stamps[0]} ms`);
    assert.ok(
      stamps[2]! - stamps[0]! >= 1_000,
      `batches arrived ${stamps[2]! - stamps[0]!} ms apart`,
    );
  });

  await check("a typed-over search aborts the CLI process", async () => {
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(
      search(sleepingDoris(), "dune", () => {}, controller.signal),
    );
    assert.ok(Date.now() - started < 2_000, `abort took ${Date.now() - started} ms`);
  });

  await check("search surfaces the CLI's reason when it printed no JSON", async () => {
    await assert.rejects(
      search(fakeDoris("", 1, "\nError: no browser found\n"), "x", () => {}),
      /Error: no browser found/,
    );
  });

  await check("listTorrents normalises the TorrServer shape", async () => {
    const fixture = JSON.stringify([
      {
        Name: "Shutter Island",
        Hash: "13ae31f99028838112f12773d4b3b96797bb287b",
        TorrentSize: 1000,
        LoadedSize: 250,
        DownloadSpeed: 1024,
        UploadSpeed: 0,
        ActivePeers: 5,
        ConnectedSeeders: 2,
        TorrentStatusString: "Torrent in db",
        files: [{ id: 1, path: "movie.mkv", length: 1000 }],
      },
    ]);
    const [torrent] = await listTorrents(fakeDoris(fixture));
    assert.ok(torrent);
    assert.equal(torrent.name, "Shutter Island");
    assert.equal(torrent.totalSize, 1000);
    assert.equal(torrent.seeders, 2);
    assert.equal(torrent.files[0]?.path, "movie.mkv");
    assert.equal(torrentSubtitle(torrent), "Torrent in db · 25.0% · ↓ 1.0 KB/s · 2 seeds");
  });

  await check("an unreachable TorrServer becomes the CLI's own message", async () => {
    await assert.rejects(
      listTorrents(fakeDoris("", 1, "Error: error sending request for url (http://127.0.0.1:8090/torrents)")),
      /error sending request/,
    );
  });

  await check("play returns the stream URL and propagates a stream error", async () => {
    const url = await play(
      fakeDoris(JSON.stringify({ url: "http://127.0.0.1:8090/stream/abc", error: null })),
      row,
    );
    assert.equal(url, "http://127.0.0.1:8090/stream/abc");

    await assert.rejects(
      play(
        fakeDoris(JSON.stringify({ url: "", error: "TorrServer unreachable at http://127.0.0.1:8090" })),
        row,
      ),
      /TorrServer unreachable/,
    );
  });

  await check("a missing binary says which one was looked for", async () => {
    await assert.rejects(
      search("/nonexistent/doris-for-the-extension-test", "x", () => {}),
      (error: unknown) =>
        error instanceof DorisMissingError &&
        error.message.includes("/nonexistent/doris-for-the-extension-test"),
    );
  });
  await check("sourceArgs names one source, on or off", () => {
    assert.deepEqual(sourceArgs("rutor", true), ["--json", "sources", "on", "rutor"]);
    assert.deepEqual(sourceArgs("rutor", false), ["--json", "sources", "off", "rutor"]);
  });

  await check("a sources form applies only the boxes that moved", () => {
    const sources: Source[] = [
      { ...registry, id: "rutracker", enabled: true },
      { ...registry, id: "rutor", enabled: false },
      { ...registry, id: "yts", enabled: true },
    ];
    // Same answer as the registry: nothing to run.
    assert.deepEqual(
      changedSources(sources, { rutracker: true, rutor: false, yts: true }),
      [],
    );
    // One box unticked, one left out of the payload (a box the form never sent reads as off).
    assert.deepEqual(
      changedSources(sources, { rutracker: false, yts: true }),
      [{ id: "rutracker", enabled: false }],
    );
    assert.deepEqual(changedSources(sources, { rutracker: true, rutor: true }), [
      { id: "rutor", enabled: true },
      { id: "yts", enabled: false },
    ]);
  });

  await check("listSources keeps the registry's own answer", async () => {
    const fixture = JSON.stringify([
      {
        id: "rutracker",
        label: "Rutracker",
        home: "https://rutracker.org/forum/index.php",
        groups: ["Movies"],
        browser: true,
        implemented: true,
        enabled: false,
      },
      { id: "yts", label: "", home: "", groups: [], browser: false, implemented: true, enabled: true },
    ]);
    const [first, second] = await listSources(fakeDoris(fixture));
    assert.ok(first && second);
    assert.equal(first.label, "Rutracker");
    assert.equal(first.enabled, false);
    assert.equal(first.browser, true);
    assert.equal(second.label, "yts");
    assert.deepEqual(second.groups, []);
  });

  await check("switching a source off reports the CLI's refusal", async () => {
    await setSourceEnabled(fakeDoris("{}"), "rutor", false);
    await assert.rejects(
      setSourceEnabled(fakeDoris("", 1, "No source with id `nope`"), "nope", true),
      /No source with id/,
    );
  });

  await check("a source's own relative link is resolved against its home", () => {
    const home = "https://rutracker.org/forum/index.php";
    assert.equal(
      resolveSourceUrl("viewtopic.php?t=6306464", home),
      "https://rutracker.org/forum/viewtopic.php?t=6306464",
    );
    // Already absolute: untouched, whatever the home says.
    assert.equal(
      resolveSourceUrl("https://rutor.info/torrent/761651", "https://rutor.info/"),
      "https://rutor.info/torrent/761651",
    );
    // Nothing to resolve against: no link rather than a broken one.
    assert.equal(resolveSourceUrl("viewtopic.php?t=1", ""), "");
    assert.equal(resolveSourceUrl("", home), "");
  });

  await check("only an absolute .torrent URL is offered for saving", () => {
    assert.equal(
      absoluteTorrentUrl({ ...row, download_url: "https://rutor.info/download/761651" }),
      "https://rutor.info/download/761651",
    );
    // rutracker answers with a path relative to its own base, and the browser
    // session doris holds is what makes it downloadable: not ours to fetch.
    assert.equal(absoluteTorrentUrl({ ...row, download_url: "dl.php?t=6306464" }), null);
    assert.equal(absoluteTorrentUrl({ ...row, download_url: "" }), null);
  });

  await check("torrentFileName survives separators and empty titles", () => {
    assert.equal(torrentFileName("The Matrix (1999)"), "The Matrix (1999).torrent");
    assert.equal(torrentFileName("a/b\\c"), "a b c.torrent");
    assert.equal(torrentFileName("   "), "torrent.torrent");
    assert.equal(torrentFileName("x".repeat(200)).length, 128);
  });

  await check("health's two answers both carry the server's URL", () => {
    assert.deepEqual(
      parseTorrServerHealth(
        JSON.stringify({ torrserver: "http://127.0.0.1:8090", browser: "Helium" }),
      ),
      { url: "http://127.0.0.1:8090", reachable: true },
    );
    assert.deepEqual(
      parseTorrServerHealth(
        JSON.stringify({ torrserver: "unreachable at http://127.0.0.1:8090" }),
      ),
      { url: "http://127.0.0.1:8090", reachable: false },
    );
    // Not health's answer at all: the caller says so instead of guessing.
    assert.equal(parseTorrServerHealth("not json"), null);
    assert.equal(parseTorrServerHealth(JSON.stringify({ browser: "Helium" })), null);
  });

  await check("the service is systemd's, and sudo may not prompt", () => {
    assert.deepEqual(serviceArgs("start"), ["-n", "systemctl", "start", "torrserver.service"]);
    assert.deepEqual(serviceArgs("stop"), ["-n", "systemctl", "stop", "torrserver.service"]);
    // `-n` is the point: a prompt in a GUI waits forever.
    assert.equal(serviceArgs("restart")[0], "-n");
  });

  await check("a sudo that wants a password says what to do instead", () => {
    const message = serviceFailure("start", "sudo: a password is required\n", 1);
    assert.match(message, /sudo systemctl start torrserver\.service/);
    assert.match(message, /without a password/);
    // Any other refusal is quoted as it came.
    assert.equal(
      serviceFailure("stop", "Failed to stop torrserver.service: Unit not loaded.\n", 5),
      "Failed to stop torrserver.service: Unit not loaded.",
    );
    assert.equal(serviceFailure("stop", "", 1), "sudo systemctl stop torrserver.service exited 1.");
  });

  await check("storage show's answer is the form's two fields", async () => {
    const answer = JSON.stringify({
      path: "/data/torrents",
      use_disk: true,
      keep_cache: false,
    });
    assert.deepEqual(await torrServerStorage(fakeDoris(answer)), {
      path: "/data/torrents",
      useDisk: true,
      keepCache: false,
    });
    // doris says (unset) as an empty string, never as a missing key.
    assert.deepEqual(
      await torrServerStorage(
        fakeDoris(JSON.stringify({ path: "", use_disk: false, keep_cache: true })),
      ),
      { path: "", useDisk: false, keepCache: true },
    );
  });

  await check("storage: the keep-cache flag is written and read the same way", () => {
    assert.deepEqual(storageSetArgs("/data/torrents", false), [
      "--json",
      "torrent",
      "storage",
      "set",
      "/data/torrents",
    ]);
    assert.deepEqual(storageSetArgs("/data/torrents", true), [
      "--json",
      "torrent",
      "storage",
      "set",
      "/data/torrents",
      "--keep-cache",
    ]);
    assert.deepEqual(storageOffArgs(), ["--json", "torrent", "storage", "off"]);
  });

  await check("sortRows arranges seeds and size, tie-broken as documented", () => {
    const seedless: TrackedRow[] = [
      { ...row, title: "small-old", source: "x", seeds_n: 0, size_bytes: 5 },
      { ...row, title: "big-new", source: "x", seeds_n: 0, size_bytes: 900 },
      { ...row, title: "many-seeds", source: "x", seeds_n: 40, size_bytes: 50 },
    ];
    assert.deepEqual(sortRows(seedless, "seeds").map((r) => r.title), [
      "many-seeds",
      "big-new",
      "small-old",
    ]);
    assert.deepEqual(sortRows(seedless, "size").map((r) => r.title), [
      "big-new",
      "many-seeds",
      "small-old",
    ]);
  });

  await check("filterBySources keeps the wanted trackers only", () => {
    const mixed: TrackedRow[] = [
      { ...row, title: "a", source: "rutor", seeds_n: 1, size_bytes: 1 },
      { ...row, title: "b", source: "rutracker", seeds_n: 2, size_bytes: 2 },
    ];
    assert.deepEqual(
      filterBySources(mixed, new Set(["rutor"])).map((r) => r.title),
      ["a"],
    );
    assert.deepEqual(filterBySources(mixed, null).map((r) => r.title), ["a", "b"], "null keeps everything");
  });

  console.log(
    failed === 0 ? `\n${passed} checks passed` : `\n${passed} passed, ${failed} failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
