import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { activateTab, closeTab, listTabs, MediatorDownError } from "../src/lib/mediator.ts";
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

/** A mediator stand-in: answers `/get_pid`, `/list_tabs` and records every path. */
async function fakeMediator(tabs: string): Promise<Fake> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/list_tabs") return response.end(tabs);
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

  const first = await fakeMediator(SAMPLE);
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
