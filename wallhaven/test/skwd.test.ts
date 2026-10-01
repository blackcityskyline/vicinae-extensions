import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setPreferenceOverrides } from "./raycast-api-stub.ts";
import { Wallpaper } from "./vicinae-api-stub.ts";
import { setDesktopWallpaper } from "../src/utils.ts";

/**
 * `src/utils.ts` end to end, against a stub that behaves the way skwd-deck's daemon does.
 *
 * Why this is not covered by `backends.test.ts`, which already round-trips a stub socket:
 * that one tests the table in isolation and has to reproduce the framing itself. This one
 * calls the shipped `callSocket` — connect, write once, read to the newline, read `error`
 * out of the reply — which is the code that actually runs.
 *
 * The stub follows `wall-proto/src/client.rs`: newline-delimited JSON in, `{id, result}` or
 * `{id, error: {code, message}}` out. The real daemon is not on this machine — `skwd-wall`
 * is neither installed nor in the Arch repositories — so the stub is the honest limit of
 * what can be verified here.
 *
 * Sequential on purpose: the backend resolves its socket from `process.env`, so two of
 * these running at once would race over the same variable.
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

function replyFor(behaviour: Behaviour, request: { id: number; params: { path: string } }): string | null {
  if (behaviour === "ok") {
    return JSON.stringify({ id: request.id, result: { applied: request.params.path } });
  }
  if (behaviour === "error") {
    return JSON.stringify({ id: request.id, error: { code: -32000, message: "no such file on disk" } });
  }
  if (behaviour === "silent") {
    // Accepts the connection, reads the request, answers nothing.
    return null;
  }
  return "not json at all";
}

type Behaviour = "ok" | "error" | "garbage" | "silent";

async function withStub(behaviour: Behaviour, body: (received: string[]) => Promise<void>): Promise<void> {
  const path = join(tmpdir(), `wallhaven-utils-${process.pid}.sock`);
  const received: string[] = [];
  const server: Server = createServer((socket) => {
    // The daemon frames with `read_line`, so it needs the newline to consider the request
    // complete. A stub that accepted a newline-less payload would pass even if
    // `skwdApply` stopped terminating its line, which is a real regression.
    let buffered = "";
    socket.on("data", (chunk) => {
      buffered += chunk.toString();
      const newline = buffered.indexOf("\n");
      if (newline === -1) return;
      received.push(buffered.slice(0, newline));
      buffered = "";
      const reply = replyFor(behaviour, JSON.parse(received[received.length - 1]));
      if (reply === null) return;
      socket.write(`${reply}\n`);
      socket.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(path, resolve));
  process.env.SKWD_WALL_V2_SOCK = path;
  setPreferenceOverrides({ backend: "skwd-wall" });

  try {
    await body(received);
  } finally {
    delete process.env.SKWD_WALL_V2_SOCK;
    setPreferenceOverrides({});
    // The socket file goes only once the listener has actually released it. Unlinking
    // before `close` finished leaves a stale file behind in /tmp on every run.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(path, { force: true });
  }
}

/** The message from a call that is expected to fail. */
async function failureFrom(path: string): Promise<string> {
  try {
    await setDesktopWallpaper(path);
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

const image = join(tmpdir(), "wallhaven-test-image.png");
writeFileSync(image, "not a real png, and it does not need to be");

async function main() {
  await withStub("ok", async (received) => {
    await setDesktopWallpaper(image);
    check("a live stub daemon accepts wall.apply", () => {
      assert.equal(received.length, 1, "the payload must be written exactly once");
      assert.deepEqual(JSON.parse(received[0]), {
        method: "wall.apply",
        params: { type: "static", path: image },
        id: 1,
      });
    });
  });

  await withStub("error", async () => {
    const message = await failureFrom(image);
    // A daemon that says no must not read as success.
    check("a daemon error is reported, not swallowed", () => {
      assert.match(message, /Skwd Wall/);
      assert.match(message, /no such file on disk/);
    });
  });

  await withStub("garbage", async () => {
    const message = await failureFrom(image);
    check("an unreadable reply is reported rather than treated as success", () => {
      assert.match(message, /unreadable reply/);
    });
  });

  await withStub("silent", async (received) => {
    const started = Date.now();
    const message = await failureFrom(image);
    check("a daemon that never answers times out instead of hanging", () => {
      // 10s of waiting is the point; a hang would be the bug this guards.
      assert.ok(Date.now() - started >= 9_000, `gave up after only ${Date.now() - started}ms`);
      assert.match(message, /no reply from .* within 10s/);
    });
    check("a silent daemon still received the request", () => {
      assert.equal(received.length, 1);
    });
  });

  // The backends Vicinae drives must not be reachable through our own argv path. One
  // assertion covers the whole reason that split exists: a second implementation of a
  // solved problem would drift, and the drift would be invisible.
  for (const id of ["awww", "swww", "hyprpaper"] as const) {
    Wallpaper.calls.length = 0;
    setPreferenceOverrides({ backend: id });
    await setDesktopWallpaper(image);
    check(`${id} goes through Wallpaper.set, not a command line`, () => {
      assert.deepEqual(Wallpaper.calls, [{ path: image, fit: "Cover" }]);
    });
  }
  setPreferenceOverrides({});

  // No stub at all: the socket does not exist. This is what a user hits who has Skwd Wall
  // installed but not running, and ENOENT deserves its own wording for it.
  setPreferenceOverrides({ backend: "skwd-wall" });
  delete process.env.SKWD_WALL_V2_SOCK;
  const missing = await failureFrom(image);
  setPreferenceOverrides({});
  check("a missing socket says so, naming the path", () => {
    assert.match(missing, /Skwd Wall/);
    assert.match(missing, /not reachable at .*wall\.sock/);
    assert.match(missing, /Is it running\?/);
  });

  rmSync(image, { force: true });
  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();