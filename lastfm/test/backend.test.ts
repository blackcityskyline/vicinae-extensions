import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { artistInfo, globalChart, libraryArtists } from "../src/functions/browse.ts";
import { LastFmError } from "../src/utils/lastfm.ts";

/**
 * The backend check: the Browse command is nothing but HTTP calls to
 * ws.audioscrobbler.com, so this drives that endpoint instead of a stub.
 *
 * Two kinds of check live here.
 *
 * Always: a request that cannot succeed still proves the transport. Last.fm
 * answers a wrong key with 403 / error 10 and an absent key with 400 / error 6,
 * and both have to come out of `call()` as a LastFmError with the status in it —
 * if the URL, the fetch or the response reading broke, the message changes.
 *
 * With LASTFM_KEY: the requests that can succeed, checked against the member
 * names measured in `src/utils/lastfm.ts`. Every list goes through `checked`, so
 * a wrong member name fails here instead of rendering as "nothing here".
 *
 * A key is a person's own credential: read it from the environment, never
 * commit it. Without one the read-only half says SKIP rather than pretending a
 * request that was rejected proves the request that was not made.
 *
 * The write half — love/unlove/getSession — needs a browser step and a session
 * key, so it is not here; those calls are covered only by `lastfm.test.ts`'s
 * reading helpers, not end to end.
 */

/**
 * Vicinae keeps password preferences in its own database, so the key the
 * launcher is already configured with is not in the environment. Read it when
 * LASTFM_KEY is absent: the test then proves the API with the same key the
 * extension uses. No sqlite3, no database, no key — the read-only checks skip.
 */
function storedKey(): string {
  const db = join(homedir(), ".local/share/vicinae/vicinae.db");
  const query =
    "select value from storage_data_item where namespace_id='@black/lastfm:preferences' and key='apikey'";
  return (spawnSync("sqlite3", [db, query], { encoding: "utf8" }).stdout ?? "").trim();
}

/** The username is a plain preference, so it is in the launcher's settings file. */
function storedUser(): string {
  const file = join(homedir(), ".config/vicinae/settings.json");
  try {
    const text = readFileSync(file, "utf8");
    return /"@black\/lastfm":\s*\{[\s\S]{0,400}?"username":\s*"([^"]*)"/.exec(text)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

const KEY = process.env.LASTFM_KEY?.trim() || storedKey();
const USER = process.env.LASTFM_USER?.trim() || storedUser();

let passed = 0;
let failed = 0;
let skipped = 0;

function skip(name: string, reason: string): void {
  skipped += 1;
  console.log(`SKIP ${name} (${reason})`);
}

function fail(name: string, error: unknown): void {
  failed += 1;
  console.log(`FAIL ${name}`);
  console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
}

/** Running the body against the real endpoint; offline is a skip, not a failure. */
async function online<T>(name: string, body: () => Promise<T>): Promise<T | undefined> {
  try {
    const value = await body();
    passed += 1;
    console.log(`ok   ${name}`);
    return value;
  } catch (error) {
    if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
      skip(name, "no route to ws.audioscrobbler.com");
      return undefined;
    }
    fail(name, error);
    return undefined;
  }
}

async function main(): Promise<void> {
  await online("a wrong key is rejected by the real endpoint, not by us", async () => {
    await assert.rejects(globalChart("0".repeat(32)), (error: unknown) => {
      assert.ok(error instanceof LastFmError, `expected LastFmError, got ${String(error)}`);
      assert.match(error.message, /answered 403/);
      return true;
    });
  });

  await online("a missing key is refused as a missing parameter", async () => {
    await assert.rejects(globalChart(""), (error: unknown) => {
      assert.ok(error instanceof LastFmError, `expected LastFmError, got ${String(error)}`);
      assert.match(error.message, /answered 400/);
      return true;
    });
  });

  if (KEY === "") {
    skip("the global charts answer with rows", "LASTFM_KEY not set");
    skip("an artist page carries tags, listeners and similar artists", "LASTFM_KEY not set");
    if (USER === "") skip("the account's library answers with rows", "LASTFM_KEY and LASTFM_USER not set");
  } else {
    await online("the global charts answer with rows", async () => {
      const { artists, tracks } = await globalChart(KEY);
      assert.ok(artists.length > 0, "no charted artists came back");
      assert.ok(tracks.length > 0, "no charted tracks came back");
      for (const artist of artists) {
        assert.ok(artist.name && artist.name.length > 0, `nameless artist: ${JSON.stringify(artist).slice(0, 120)}`);
        assert.match(artist.url ?? "", /^https:\/\/www\.last\.fm\//);
      }
      for (const track of tracks) {
        assert.ok(track.name && track.name.length > 0, `nameless track: ${JSON.stringify(track).slice(0, 120)}`);
        assert.ok(track.artist?.name, "a charted track came back without an artist");
      }
    });

    await online("an artist page carries tags, listeners and similar artists", async () => {
      const info = await artistInfo(KEY, "Radiohead");
      assert.equal(info.name, "Radiohead");
      assert.ok(Number(info.listeners) > 0, `listeners read as ${JSON.stringify(info.listeners)}`);
      assert.ok(info.tags.length > 0, "no tags came back");
      assert.ok(
        info.tags.every((tag) => typeof tag === "string" && tag.length > 0),
        JSON.stringify(info.tags.slice(0, 3)),
      );
      assert.ok(info.similar.length > 0, "no similar artists came back");
      assert.ok(info.bio.length > 0, "the bio summary came back empty");
    });

    if (USER === "") {
      skip("the account's library answers with rows", "LASTFM_USER not set");
    } else {
      await online("the account's library answers with rows", async () => {
        const rows = await libraryArtists(KEY, USER, 1);
        for (const artist of rows) {
          assert.ok(artist.name, `nameless library row: ${JSON.stringify(artist).slice(0, 120)}`);
          assert.ok(artist.url, "a library row came back without a url");
        }
      });
    }
  }

  console.log(
    `\npassed: ${passed}, failed: ${failed}, skipped: ${skipped}` +
      (KEY === "" ? " — set LASTFM_KEY to run the read-only checks" : ""),
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
