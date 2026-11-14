import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { findProfile, withSnapshot } from "../src/lib/browser.ts";
import { startImageServer } from "../src/lib/image-server.ts";
import {
  activateTab,
  clearBrowsingData,
  closeTab,
  deleteHistoryRange,
  deleteHistoryUrl,
  listTabs,
  MediatorDownError,
  screenshot,
} from "../src/lib/mediator.ts";
import { looksLikeUrl } from "../src/lib/note-target.ts";
import { getNote, notesPage, removeNote, setNote } from "../src/lib/notes.ts";
import { bookmarksPage, historyPage } from "../src/lib/places.ts";
import { closedTabsFrom, decompressBlock, decompressMozLz4, readClosedTabs, sessionFile } from "../src/lib/session.ts";
import { parseTabs, portFor, tabNumber } from "../src/lib/tabs.ts";

let failures = 0;

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

/** Lines in the exact shape the mediator's `/list_tabs` answers with. */
const SAMPLE = [
  "1.17\tRaycast - Store\thttps://www.raycast.com/store/3#list",
  "1.2\tOpenCode plugin that auto-sends continue\thttps://github.com/developing-today/opencode-auto-continue",
  "2.1\tHome\thttp://localhost:8090/",
  "",
].join("\n");

type Fake = { server: Server; port: number; requests: string[] };

/**
 * A mediator stand-in: answers `/get_pid`, `/list_tabs`, `/query_tabs` (with the
 * lines whose id is in `discarded`), the tab routes and the browser-data routes,
 * and records every path.
 */
async function fakeMediator(tabs: string, discarded: string[] = [], failQuery = false): Promise<Fake> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/list_tabs") return response.end(tabs);
    if (request.url?.startsWith("/query_tabs/")) {
      if (failQuery) return response.destroy();
      const wanted = new Set(discarded);
      const lines = tabs.split("\n").filter((line) => wanted.has(line.split("\t")[0] ?? ""));
      return response.end(lines.join("\n"));
    }
    if (request.url?.startsWith("/screenshot/")) {
      return response.end(
        JSON.stringify({ data: "data:image/png;base64,iVBORw0KGgo=", tab: 4, window: 2 }),
      );
    }
    return response.end("OK");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: (server.address() as AddressInfo).port, requests };
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** A `places.sqlite` with the three tables the queries touch, plus `rows`. */
function makePlaces(profile: string): DatabaseSync {
  mkdirSync(profile, { recursive: true });
  const database = new DatabaseSync(join(profile, "places.sqlite"));
  database.exec(`
    CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, last_visit_date INTEGER);
    CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
    CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, parent INTEGER, fk INTEGER, title TEXT, dateAdded INTEGER);
  `);
  return database;
}

/** An LZ4 block made of literals only, which is what a JSON body compresses to here. */
function literalBlock(text: string): Uint8Array {
  const bytes = Buffer.from(text, "utf8");
  const head: number[] = [];
  if (bytes.length < 15) {
    head.push(bytes.length << 4);
  } else {
    head.push(0xf0);
    let rest = bytes.length - 15;
    while (rest >= 255) {
      head.push(255);
      rest -= 255;
    }
    head.push(rest);
  }
  return new Uint8Array([...head, ...bytes]);
}

/** A whole `mozLz40\0` file around `text`, the shape the session store uses. */
function mozLz4File(text: string): Uint8Array {
  const header = Buffer.alloc(12);
  header.write("mozLz40\0", 0, "latin1");
  header.writeUInt32LE(Buffer.byteLength(text), 8);
  return new Uint8Array(Buffer.concat([header, Buffer.from(literalBlock(text))]));
}

async function main(): Promise<void> {
  await check("parseTabs reads the mediator's line format and prefixes the letter", () => {
    assert.deepEqual(parseTabs(SAMPLE, "a"), [
      { id: "a.1.17", title: "Raycast - Store", url: "https://www.raycast.com/store/3#list" },
      {
        id: "a.1.2",
        title: "OpenCode plugin that auto-sends continue",
        url: "https://github.com/developing-today/opencode-auto-continue",
      },
      { id: "a.2.1", title: "Home", url: "http://localhost:8090/" },
    ]);
  });

  await check("parseTabs drops lines without all three fields", () => {
    const stdout = "1.1\tOnly two fields\n1.2\t\t\n\n1.3\tTitle\thttps://example.com\n";
    assert.deepEqual(parseTabs(stdout, "b"), [{ id: "b.1.3", title: "Title", url: "https://example.com" }]);
  });

  await check("an id carries the mediator, the window and the tab", () => {
    assert.equal(tabNumber("a.1.17"), "17");
    assert.equal(portFor("b.2.3", [4625, 4626]), 4626);
  });

  const first = await fakeMediator(SAMPLE, ["1.17", "2.1"]);
  const second = await fakeMediator("5.4\tSecond browser\thttps://example.org/\n");
  const ports = [first.port, await closedPort(), second.port];

  try {
    await check("listTabs merges every live mediator, in port order, and skips dead ports", async () => {
      const tabs = await listTabs(ports);
      assert.deepEqual(
        tabs.map((tab) => tab.id),
        ["a.1.17", "a.1.2", "a.2.1", "c.5.4"],
      );
    });

    await check("tabs the add-on reports as discarded are marked unloaded", async () => {
      const tabs = await listTabs(ports);
      assert.deepEqual(
        tabs.map((tab) => tab.unloaded),
        [true, false, true, false],
      );
    });

    await check("a failing discarded query leaves the list unmarked instead of empty", async () => {
      const unhelpful = await fakeMediator(SAMPLE, [], true);
      try {
        const tabs = await listTabs([unhelpful.port]);
        assert.equal(tabs.length, 3);
        assert.ok(tabs.every((tab) => !tab.unloaded));
      } finally {
        unhelpful.server.close();
      }
    });

    await check("activate and close address the mediator that owns the tab, with the tab number", async () => {
      await activateTab("c.5.4", ports);
      await closeTab("a.1.17", ports);

      assert.ok(first.requests.includes("/activate_tab/17?focused=1") === false);
      assert.ok(second.requests.includes("/activate_tab/4?focused=1"), second.requests.join(" "));
      assert.ok(first.requests.includes("/close_tabs/17"), first.requests.join(" "));
    });

    await check("a tab id without a numeric tab never reaches the mediator", async () => {
      const before = first.requests.length;
      await assert.rejects(closeTab("a.1.two", ports), /carries no numeric tab/);
      assert.equal(first.requests.length, before);
    });

    const cache = mkdtempSync(join(tmpdir(), "brotab-cache-"));
    const previousCache = process.env.XDG_CACHE_HOME;
    process.env.XDG_CACHE_HOME = cache;
    try {
      await check("a screenshot is written to the cache and reported by path", async () => {
        const shot = await screenshot("a.1.17", ports);
        assert.equal(shot.tab, 4);
        assert.equal(shot.window, 2);
        assert.ok(shot.file.startsWith(join(cache, "brotab-ng", "screenshots")), shot.file);
        assert.deepEqual(readFileSync(shot.file), Buffer.from("89504e470d0a1a0a", "hex"));
        assert.equal(shot.bytes, 8);
        assert.ok(first.requests.includes("/screenshot/17"));
      });
    } finally {
      if (previousCache === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = previousCache;
      rmSync(cache, { recursive: true, force: true });
    }

    await check("history deletion sends the URL as padded base64url", async () => {
      await deleteHistoryUrl("https://example.com/a b", ports);
      const route = first.requests.find((path) => path.startsWith("/delete_history_url/"));
      assert.ok(route, first.requests.join(" "));
      const encoded = route.slice("/delete_history_url/".length);
      assert.equal(Buffer.from(encoded, "base64url").toString(), "https://example.com/a b");
      assert.match(encoded, /=$/);
    });

    await check("a history range and browsing data carry the rounded bounds", async () => {
      await deleteHistoryRange(1_700_000_000_000.4, 1_700_000_001_000.6, ports);
      await clearBrowsingData(1_700_000_000_000, { cookies: true, cache: false }, ports);

      assert.ok(first.requests.includes("/delete_history_range/1700000000000/1700000001001"), first.requests.join(" "));
      assert.ok(
        first.requests.includes("/clear_browsing_data?since=1700000000000&cookies=1&cache=0"),
        first.requests.join(" "),
      );
    });
  } finally {
    first.server.close();
    second.server.close();
  }

  await check("no mediator is reported as the mediator being down", async () => {
    await assert.rejects(listTabs([await closedPort()]), MediatorDownError);
  });

  await check("a note started from the search bar knows a page from a phrase", () => {
    assert.equal(looksLikeUrl("https://example.com/x?y=1"), true);
    assert.equal(looksLikeUrl("file:///tmp/notes.md"), true);
    assert.equal(looksLikeUrl("github.com/blackcityskyline/doris"), true);
    assert.equal(looksLikeUrl("example.com"), true);
    assert.equal(looksLikeUrl("why I keep notes"), false);
    assert.equal(looksLikeUrl("v1.2 released"), false);
    assert.equal(looksLikeUrl("   "), false);
  });

  // The markdown renderer only loads images over HTTP, so the preview hands it a
  // loopback URL. Nothing outside the registered file may be reachable.
  {
    const served = mkdtempSync(join(tmpdir(), "brotab-image-"));
    const png = join(served, "shot.png");
    const bytes = Buffer.from("89504e470d0a1a0a", "hex");
    writeFileSync(png, bytes);
    const server = await startImageServer();

    try {
      await check("the image server answers the registered file", async () => {
        const response = await fetch(server.urlFor(png));
        assert.equal(response.status, 200);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      });

      await check("the image server refuses anything it was not given", async () => {
        const unknown = await fetch(server.urlFor(png).replace(/\/[^/]+$/, "/missing.png"));
        assert.equal(unknown.status, 404);
        const traversal = await fetch(`${new URL(server.urlFor(png)).origin}/../../etc/passwd`);
        assert.equal(traversal.status, 404);
      });
    } finally {
      server.close();
      rmSync(served, { recursive: true, force: true });
    }
  }

  // History and bookmarks are read from a copy of the browser's own database.
  // The copy is what makes the read safe while the browser holds it open.
  {
    const profile = mkdtempSync(join(tmpdir(), "brotab-places-"));
    const database = makePlaces(profile);
    try {
      database.exec(`
        INSERT INTO moz_places (id, url, title, last_visit_date) VALUES
          (1, 'https://example.com/a', 'Page A', 1700000003000000),
          (2, 'https://example.com/b', NULL, 1700000002000000),
          (3, 'https://example.com/100%25off', 'Percent', 1690000000000000),
          (4, 'place:sort=8', 'A place query', 1699999999000000),
          (5, 'https://example.com/c', 'Page C', NULL);
        INSERT INTO moz_historyvisits (place_id, visit_date) VALUES
          (1, 1700000001000000), (1, 1700000003000000),
          (2, 1700000002000000),
          (3, 1690000000000000),
          (4, 1699999999000000);
        INSERT INTO moz_bookmarks (id, type, parent, fk, title, dateAdded) VALUES
          (10, 2, 0, NULL, 'root', 0),
          (11, 2, 10, NULL, 'Bookmarks Toolbar', 0),
          (12, 2, 11, NULL, 'Dev', 0),
          (20, 1, 12, 1, 'My A', 1600000000000000),
          (21, 1, 12, 2, '', 1600000005000000),
          (22, 1, 11, 3, 'Off', 1600000009000000),
          (23, 1, 12, 5, '', 1600000007000000);
      `);

      await check("history is newest first, counts visits and ignores place: queries", () => {
        const page = historyPage(profile, "", 10, 0);
        assert.deepEqual(
          page.items.map((hit) => [hit.url, hit.lastVisit, hit.visits]),
          [
            ["https://example.com/a", 1_700_000_003_000, 2],
            ["https://example.com/b", 1_700_000_002_000, 1],
            ["https://example.com/100%25off", 1_690_000_000_000, 1],
          ],
        );
        assert.equal(page.items[1]?.title, "https://example.com/b");
        assert.equal(page.hasMore, false);
      });

      await check("history pages one row past the limit to say whether more exist", () => {
        const first = historyPage(profile, "", 2, 0);
        assert.equal(first.items.length, 2);
        assert.equal(first.hasMore, true);
        const second = historyPage(profile, "", 2, 2);
        assert.deepEqual(
          second.items.map((hit) => hit.url),
          ["https://example.com/100%25off"],
        );
        assert.equal(second.hasMore, false);
      });

      await check("a search matches title or URL, and treats % as a literal", () => {
        assert.deepEqual(
          historyPage(profile, "page a", 10, 0).items.map((hit) => hit.url),
          ["https://example.com/a"],
        );
        assert.deepEqual(
          historyPage(profile, "%", 10, 0).items.map((hit) => hit.url),
          ["https://example.com/100%25off"],
        );
      });

      await check("bookmarks carry the folder path, skipping root, and fall back to their page title", () => {
        const page = bookmarksPage(profile, "", 10, 0);
        assert.deepEqual(
          page.items.map((mark) => [mark.title, mark.folder, mark.addedAt]),
          [
            ["Off", "Bookmarks Toolbar", 1_600_000_009_000],
            ["Page C", "Bookmarks Toolbar/Dev", 1_600_000_007_000],
            ["https://example.com/b", "Bookmarks Toolbar/Dev", 1_600_000_005_000],
            ["My A", "Bookmarks Toolbar/Dev", 1_600_000_000_000],
          ],
        );
        assert.equal(page.hasMore, false);
      });

      await check("bookmark search reaches the page title and the URL", () => {
        assert.deepEqual(
          bookmarksPage(profile, "page c", 10, 0).items.map((mark) => mark.url),
          ["https://example.com/c"],
        );
        assert.deepEqual(
          bookmarksPage(profile, "100%", 10, 0).items.map((mark) => mark.url),
          ["https://example.com/100%25off"],
        );
      });

      await check("the snapshot is a copy, so the browser's own file is untouched", () => {
        const before = statSync(join(profile, "places.sqlite")).mtimeMs;
        withSnapshot(profile, (copy) => copy.prepare("SELECT COUNT(*) AS n FROM moz_places").get());
        assert.equal(statSync(join(profile, "places.sqlite")).mtimeMs, before);
      });
    } finally {
      database.close();
      rmSync(profile, { recursive: true, force: true });
    }
  }

  // Notes live in this project's own database, so they are read and written
  // here without the browser or a mediator.
  {
    const dir = mkdtempSync(join(tmpdir(), "brotab-notes-"));
    const file = join(dir, "notes.sqlite");
    try {
      await check("a note is written once per URL and an edit replaces the body", () => {
        setNote("https://example.com/", "first", file);
        setNote("https://example.com/", "second", file);
        assert.equal(getNote("https://example.com/", file)?.body, "second");
        assert.equal(getNote("https://example.com/none", file), null);
      });

      await check("notes come newest edit first, paged, and are searched in URL and body", () => {
        const database = new DatabaseSync(file);
        try {
          database.exec(`
            INSERT INTO note (url, body, updated_at) VALUES
              ('https://one', 'alpha', 100),
              ('https://two', 'beta gamma', 200),
              ('https://three', 'delta', 300);
          `);
        } finally {
          database.close();
        }

        assert.deepEqual(
          notesPage("", file, 2, 0).items.map((note) => note.url),
          ["https://example.com/", "https://three"],
        );
        assert.equal(notesPage("", file, 2, 0).hasMore, true);
        assert.deepEqual(
          notesPage("", file, 2, 2).items.map((note) => note.url),
          ["https://two", "https://one"],
        );
        assert.deepEqual(
          notesPage("gamma", file, 10, 0).items.map((note) => note.url),
          ["https://two"],
        );
      });

      await check("removing a note reports whether there was one", () => {
        assert.equal(removeNote("https://one", file), true);
        assert.equal(removeNote("https://one", file), false);
        assert.equal(notesPage("", file, 10, 0).items.length, 3);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // The session store is a mozLz4-wrapped JSON document, so the decoder and the
  // closed-tab walk are checked against a real block format.
  {
    await check("an LZ4 block resolves overlapping and non-overlapping back-references", () => {
      // token 3 literals + match of 2 (+4), offset 3: "abc" then "abcabc".
      const overlapping = new Uint8Array([0x32, 0x61, 0x62, 0x63, 0x03, 0x00]);
      assert.equal(Buffer.from(decompressBlock(overlapping, 9)).toString(), "abcabcabc");

      // offset 4 with a 4-byte match: the copied range does not overlap itself.
      const apart = new Uint8Array([0x40, 0x61, 0x62, 0x63, 0x64, 0x04, 0x00]);
      assert.equal(Buffer.from(decompressBlock(apart, 8)).toString(), "abcdabcd");
    });

    await check("a mozLz4 header is required and its size is honoured", () => {
      assert.equal(decompressMozLz4(mozLz4File("hello")), "hello");
      const wrong = mozLz4File("hello");
      wrong[0] = 0;
      assert.throws(() => decompressMozLz4(wrong), /not a mozLz4 file/);
    });

    await check("closed tabs take the selected entry, fall back to the last one, and sort newest first", () => {
      const tabs = closedTabsFrom({
        windows: [
          {
            _closedTabs: [
              { closedAt: 100, title: "Old", state: { entries: [{ url: "https://old" }, { url: "https://new", title: "New" }], index: 1 } },
              { closedAt: 300, title: "", state: { entries: [{ url: "https://last" }, { url: "https://last2", title: "Last2" }], index: 9 } },
              { closedAt: 200, state: { entries: [] } },
            ],
          },
        ],
      });
      assert.deepEqual(tabs, [
        { closedAt: 300, title: "Last2", url: "https://last2" },
        { closedAt: 100, title: "Old", url: "https://new" },
      ]);
    });

    const profile = mkdtempSync(join(tmpdir(), "brotab-session-"));
    const backups = join(profile, "sessionstore-backups");
    mkdirSync(backups, { recursive: true });
    const session = JSON.stringify({
      windows: [{ _closedTabs: [{ closedAt: 42, title: "Closed", state: { entries: [{ url: "https://closed" }] } }] }],
    });
    writeFileSync(join(backups, "previous.jsonlz4"), mozLz4File(session));
    writeFileSync(join(backups, "recovery.jsonlz4"), mozLz4File(session));
    try {
      await check("the newer session file wins", () => {
        assert.equal(sessionFile(profile), join(backups, "recovery.jsonlz4"));
        assert.deepEqual(readClosedTabs(profile), [{ closedAt: 42, title: "Closed", url: "https://closed" }]);
      });
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }

    await check("a profile without a session store has no closed tabs", () => {
      const empty = mkdtempSync(join(tmpdir(), "brotab-nosession-"));
      try {
        assert.equal(sessionFile(empty), null);
        assert.deepEqual(readClosedTabs(empty), []);
      } finally {
        rmSync(empty, { recursive: true, force: true });
      }
    });
  }

  // Profile discovery prefers the profile whose database moved last, because
  // several browsers keep one each.
  {
    const config = mkdtempSync(join(tmpdir(), "brotab-config-"));
    const make = (relative: string, modified: Date) => {
      const dir = join(config, relative);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "prefs.js"), "");
      writeFileSync(join(dir, "places.sqlite"), "");
      utimesSync(join(dir, "places.sqlite"), modified, modified);
      return dir;
    };

    try {
      const old = make("zen/aaa", new Date("2026-01-01T00:00:00Z"));
      const recent = make(".mozilla/firefox/bbb", new Date("2026-06-01T00:00:00Z"));

      await check("the profile with the newest history wins, one or two levels down", () => {
        assert.equal(findProfile({ config }), recent);
      });

      await check("an explicit profile wins when it has a prefs.js", () => {
        assert.equal(findProfile({ config, explicit: old }), old);
        assert.throws(() => findProfile({ config, explicit: join(config, "nope") }), /no prefs\.js/);
      });

      await check("a config with no profile says so instead of guessing", () => {
        const empty = mkdtempSync(join(tmpdir(), "brotab-empty-"));
        try {
          assert.throws(() => findProfile({ config: empty }), /No browser profile with prefs\.js/);
        } finally {
          rmSync(empty, { recursive: true, force: true });
        }
      });
    } finally {
      rmSync(config, { recursive: true, force: true });
    }
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
