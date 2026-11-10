import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { searchSql, type HistoryRow } from "../src/utils/history-sql.ts";

// The query is checked against a real SQLite database shaped like Chrome's, not
// against the string it happens to build: ordering, the hidden and blocklist
// filters and the LIKE escaping only mean anything to the engine.
const dir = mkdtempSync(join(tmpdir(), "little-chrome-test-"));
const history = join(dir, "History");
const favicons = join(dir, "Favicons");

const CHROME_EPOCH_OFFSET_SECONDS = 11_644_473_600;
/** Chrome stores microseconds since 1601. */
const chromeTime = (msAgo: number): number =>
  Math.round((Date.now() / 1000 + CHROME_EPOCH_OFFSET_SECONDS - msAgo / 1000) * 1_000_000);

const urls = [
  // id, url, title, visit_count, typed_count, last_visit_time, hidden
  [1, "https://old.example.com/", "Old page", 50, 0, chromeTime(400 * 86_400_000), 0],
  [2, "https://fresh.example.com/", "Fresh page", 1, 0, chromeTime(60_000), 0],
  [3, "https://github.com/raycast/extensions", "Raycast extensions", 30, 0, chromeTime(60_000), 0],
  [4, "https://hidden.example.com/", "Hidden page", 99, 9, chromeTime(60_000), 1],
  [5, "https://blocked.example.com/", "Blocked page", 99, 9, chromeTime(60_000), 0],
  [6, "https://other.example.com/100%-real", "Percent 100% real", 1, 0, chromeTime(60_000), 0],
  [7, "https://other.example.com/100xxxreal", "Wildcard decoy", 1, 0, chromeTime(60_000), 0],
  [8, "https://typo.example.com/", "Typed often", 7, 7, chromeTime(30 * 86_400_000), 0],
];

execFileSync("sqlite3", [history], {
  input: [
    "CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, typed_count INTEGER, last_visit_time INTEGER, hidden INTEGER);",
    ...urls.map(
      ([id, url, title, visits, typed, time, hidden]) =>
        `INSERT INTO urls VALUES (${id}, '${url}', '${title}', ${visits}, ${typed}, ${time}, ${hidden});`,
    ),
  ].join("\n"),
});

execFileSync("sqlite3", [favicons], {
  input: [
    "CREATE TABLE icon_mapping (id INTEGER PRIMARY KEY, page_url TEXT, icon_id INTEGER);",
    "CREATE TABLE favicon_bitmaps (id INTEGER PRIMARY KEY, icon_id INTEGER, last_updated INTEGER, image_data BLOB, width INTEGER);",
    "INSERT INTO favicon_bitmaps VALUES (42, 1, 1700000000000000, X'89504E47', 32);",
    "INSERT INTO icon_mapping VALUES (1, 'https://github.com/raycast/extensions', 1);",
  ].join("\n"),
});

function run(sql: string, attach?: string): HistoryRow[] {
  const args = attach ? ["-cmd", `ATTACH '${attach}' AS f`, "-json", history, sql] : ["-json", history, sql];
  const stdout = execFileSync("sqlite3", args, { encoding: "utf-8" });
  return stdout.trim() === "" ? [] : (JSON.parse(stdout) as HistoryRow[]);
}

const blocklist = { urls: ["https://blocked.example.com/"], hosts: [] };
const search = (words: string[], withFavicons = false): HistoryRow[] =>
  run(searchSql(words, blocklist, withFavicons), withFavicons ? favicons : undefined);

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

check("every word must match somewhere", () => {
  assert.deepEqual(
    search(["raycast"]).map((row) => row.url),
    ["https://github.com/raycast/extensions"],
  );
  assert.deepEqual(search(["raycast", "missing"]), []);
});

check("a query with no words lists the most useful pages first", () => {
  const found = search([]).map((row) => row.url);
  assert.equal(found[0], "https://github.com/raycast/extensions");
  assert.ok(found.includes("https://fresh.example.com/"));
});

check("hidden rows are never returned", () => {
  assert.ok(!search([]).some((row) => row.url.includes("hidden.example.com")));
});

check("blocklisted URLs are never returned", () => {
  assert.ok(!search(["blocked"]).some((row) => row.url.includes("blocked.example.com")));
  assert.deepEqual(search(["blocked"]), []);
});

check("typed visits weigh more than plain visits", () => {
  const found = search(["example"]).map((row) => row.url);
  assert.ok(found.indexOf("https://typo.example.com/") < found.indexOf("https://fresh.example.com/"));
});

check("a wildcard in the query is a literal, not a wildcard", () => {
  assert.deepEqual(
    search(["100%-real"]).map((row) => row.url),
    ["https://other.example.com/100%-real"],
  );
  assert.deepEqual(
    search(["100%-real"]).some((row) => row.url.includes("decoy")),
    false,
  );
});

check("a hidden site hides its pages through the query too", () => {
  const hiddenSite = search(["other"]);
  assert.equal(hiddenSite.length, 2);
  const sql = searchSql(["other"], { urls: [], hosts: ["other.example.com"] }, false);
  assert.deepEqual(run(sql), []);
});

check("the favicon of a page comes back with it", () => {
  const [row] = search(["raycast"], true);
  assert.equal(row?.bitmap, "42-1700000000000000");
});

check("without a Favicons database the row still has the same shape", () => {
  const [row] = search(["raycast"]);
  assert.equal(row?.bitmap, null);
  assert.equal(row?.url, "https://github.com/raycast/extensions");
});

rmSync(dir, { recursive: true, force: true });

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
