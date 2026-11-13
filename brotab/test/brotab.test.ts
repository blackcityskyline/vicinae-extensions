import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { BrotabNotFoundError, describeError, listTabs } from "../src/lib/brotab.ts";
import { parseTabs } from "../src/lib/tabs.ts";

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

/** Three tabs in the exact shape `brotab list` prints: id, title, url, tab separated. */
const SAMPLE = [
  "a.1.17\tRaycast - Store\thttps://www.raycast.com/store/3#list",
  "a.1.2\tOpenCode plugin that auto-sends continue\thttps://github.com/developing-today/opencode-auto-continue",
  "a.2.1\tHome\thttp://localhost:8090/",
  "",
].join("\n");

async function main(): Promise<void> {
  await check("parseTabs reads id, title and url from the tab-separated output", () => {
    assert.deepEqual(parseTabs(SAMPLE), [
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
    const stdout = "a.1.1\tOnly two fields\na.1.2\t\t\n\na.1.3\tTitle\thttps://example.com\n";
    assert.deepEqual(parseTabs(stdout), [
      { id: "a.1.3", title: "Title", url: "https://example.com" },
    ]);
  });

  const dir = mkdtempSync(join(os.tmpdir(), "brotab-test-"));
  const log = join(dir, "calls.log");
  const fake = join(dir, "brotab");
  writeFileSync(fake, `#!/bin/sh\necho "$@" >> ${log}\nprintf 'a.1.1\\tFake tab\\thttps://example.com\\n'\n`);
  chmodSync(fake, 0o755);

  try {
    await check("listTabs runs the binary once, with no health-check probe", async () => {
      const tabs = await listTabs(fake);
      assert.deepEqual(tabs, [{ id: "a.1.1", title: "Fake tab", url: "https://example.com" }]);
      assert.equal(readFileSync(log, "utf8").trim(), "list");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  await check("a missing binary is reported as not installed", async () => {
    await assert.rejects(listTabs("/nonexistent/brotab"), BrotabNotFoundError);
  });

  await check("a refused mediator connection is explained", () => {
    const error = Object.assign(new Error("Command failed: brotab list"), {
      stderr: "ConnectionRefusedError: [Errno 111] Connection refused",
      message: "connect ECONNREFUSED 127.0.0.1:4625",
    });
    assert.match(describeError(error), /mediator is not running/);
    assert.equal(describeError(new Error("boom")), "boom");
  });

  // The real tool is the authority for the format; skipped when it is absent or
  // its mediator is down, neither of which is a parser bug.
  const real = "the machine's brotab output parses into one tab per reported line";
  let stdout: string | null = null;
  try {
    stdout = execFileSync("brotab", ["list"], { encoding: "utf8" });
  } catch {
    console.log(`SKIP ${real}: brotab is not installed or its mediator is down`);
  }

  if (stdout !== null) {
    await check(real, () => {
      const reported = stdout!.split("\n").filter((line) => line.trim() !== "");
      const tabs = parseTabs(stdout!);
      assert.equal(tabs.length, reported.length);
      for (const tab of tabs) {
        assert.match(tab.url, /^(https?|file|about):/, `${tab.id} carries no url: ${tab.url}`);
      }
    });
  }

  console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
