import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliError, CliNotFoundError, resolveBinary, run } from "../src/lib/cli.ts";
import { startImageServer } from "../src/lib/image-server.ts";
import { activateTab, closeTab, listTabs, MediatorDownError } from "../src/lib/mediator.ts";
import { looksLikeUrl } from "../src/lib/note-target.ts";
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
 * lines whose id is in `discarded`) and records every path.
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
    if (request.url?.startsWith("/activate_tab/") || request.url?.startsWith("/close_tabs/")) {
      return response.end("OK");
    }
    response.end("1234");
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

  // The CLI is the only source for history, bookmarks, closed tabs and notes, so
  // the call has to report its own failures rather than an empty list.
  const dir = mkdtempSync(join(tmpdir(), "brotab-cli-"));
  const argsFile = join(dir, "args");

  function fakeCli(name: string, body: string): string {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    return file;
  }

  try {
    const answering = fakeCli("answering", `printf '%s\\n' "$@" > ${argsFile}\nprintf '%s' '{"hits":[{"url":"https://example.com/","title":"Example","lastVisit":1,"visits":2}]}'`);

    await check("run appends --json and parses the one JSON object", async () => {
      const answer = await run<{ hits: { url: string; visits: number }[] }>(answering, ["history", "example", "--limit", "5"]);
      assert.equal(answer.hits[0]?.url, "https://example.com/");
      assert.deepEqual(readFileSync(argsFile, "utf8").trim().split("\n"), ["history", "example", "--limit", "5", "--json"]);
    });

    await check("run reports the CLI's own message when it exits non-zero", async () => {
      const failing = fakeCli("failing", `printf '%s\\n' 'no note for https://example.com/' >&2\nexit 1`);
      await assert.rejects(run(failing, ["note", "get", "https://example.com/"]), (error: Error) => {
        assert.ok(error instanceof CliError, `got ${error.name}`);
        assert.equal(error.message, "no note for https://example.com/");
        return true;
      });
    });

    await check("run names a missing binary instead of blaming the command", async () => {
      await assert.rejects(run(join(dir, "absent"), ["closed"]), CliNotFoundError);
    });

    await check("run refuses stdout that is not the promised JSON", async () => {
      const chatty = fakeCli("chatty", `printf '%s\\n' 'starting up'`);
      await assert.rejects(run(chatty, ["tabs"]), CliError);
    });

    await check("an empty preference still finds the CLI in ~/.local/bin", () => {
      const home = join(dir, "home");
      mkdirSync(join(home, ".local", "bin"), { recursive: true });
      writeFileSync(join(home, ".local", "bin", "brotab-ng"), "", { mode: 0o755 });

      assert.equal(resolveBinary(undefined, home), join(home, ".local", "bin", "brotab-ng"));
      assert.equal(resolveBinary("", home), join(home, ".local", "bin", "brotab-ng"));
      assert.equal(resolveBinary(" /opt/brotab-ng ", home), "/opt/brotab-ng");
      assert.equal(resolveBinary(undefined, join(home, "elsewhere")), "brotab-ng");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // The CLI is the authority for which tabs exist; this talks to the same
  // mediators without it. Skipped when the browser is closed.
  const real = "our list matches what the brotab CLI reports";
  let cli: string | null = null;
  try {
    const reported = execFileSync("brotab", ["list"], { encoding: "utf8", timeout: 15_000 });
    cli = reported.trim() === "" ? null : reported;
  } catch {
    console.log(`SKIP ${real}: brotab is not installed or its mediator is down`);
  }

  if (cli !== null) {
    await check(real, async () => {
      const ours = await listTabs();
      const theirs = cli!.split("\n").filter((line) => line.trim() !== "");
      assert.equal(ours.length, theirs.length);
      assert.deepEqual(
        ours.map((tab) => tab.id),
        theirs.map((line) => line.split("\t")[0]),
      );
    });
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
