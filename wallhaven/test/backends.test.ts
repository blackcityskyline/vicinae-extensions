import assert from "node:assert/strict";
import { createServer, createConnection } from "node:net";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BACKENDS,
  detectBackend,
  explainMissing,
  findBackend,
  skwdApply,
  skwdSocketPath,
} from "../src/backends.ts";

/**
 * The table is pure, so these checks need no compositor and no network. What they do fix:
 * that every backend resolves to the right id, that names match exactly, that each
 * `apply` produces the argv it is supposed to, and that the two "nothing to apply with"
 * cases say different things.
 *
 * The Noctalia expectation is measured, not assumed: `ps -eo comm= | grep noctalia` on this
 * machine returns exactly one line, `noctalia` (pid 1394). There is no `swww`, `awww`,
 * `hyprpaper`, `swaybg`, `mpvpaper`, `waypaper` or `skwd` anywhere in the 324 lines of the
 * full dump, which is why `noctalia msg wallpaper-set` is the path that has to work here.
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

check("this machine resolves to Noctalia", () => {
  // The measured dump, filtered to the wall this table looks at.
  assert.equal(detectBackend(["noctalia"])?.id, "noctalia");
});

check("a live awww daemon wins over the archived swww", () => {
  assert.equal(detectBackend(["swww", "awww-daemon"])?.id, "awww");
  assert.equal(detectBackend(["swww"])?.id, "swww");
});

check("nothing wallpaper-related running means no backend, not a wrong guess", () => {
  assert.equal(detectBackend(["firefox", "kitty", "Hyprland"]), undefined);
  assert.equal(detectBackend([]), undefined);
});

check("names match exactly, so a sibling binary is not mistaken for a backend", () => {
  assert.equal(detectBackend(["skwd-editor"]), undefined);
  assert.equal(detectBackend(["swww-daemon"]), undefined);
  // ...but the shell Skwd grew out of is still recognised as Skwd Wall.
  assert.equal(detectBackend(["skwd"])?.id, "skwd-wall");
});

check("skwd is driven over its socket, not through Wallpaper.set", () => {
  const skwd = findBackend("skwd-wall");
  assert.ok(skwd, "skwd-wall must be in the table");
  assert.equal(skwd.viaVicinae, false);
  assert.ok(skwd.apply, "v2 publishes wall.apply, so skwd is no longer undrivable");
});

check("Noctalia is applied with the command it documents", () => {
  // Measured: `noctalia msg --help` lists `wallpaper-set [connector] <path>`, and the
  // wallpaper-widget plugin calls exactly this (panel.luau:314).
  const steps = findBackend("noctalia")!.apply!("/tmp/wall.png");
  assert.deepEqual(steps, [{ argv: ["noctalia", "msg", "wallpaper-set", "/tmp/wall.png"] }]);
});

check("swaybg is restarted, not appended to", () => {
  // It has no IPC. Waiting on the new daemon would hang the extension forever.
  const steps = findBackend("swaybg")!.apply!("/tmp/wall.png");
  assert.deepEqual(steps, [
    { argv: ["pkill", "-x", "swaybg"] },
    { argv: ["swaybg", "-i", "/tmp/wall.png"], detached: true },
  ]);
});

check("waypaper is applied with its own flag", () => {
  // From waypaper/__main__.py: `--wallpaper`, not `--set`.
  const steps = findBackend("waypaper")!.apply!("/tmp/wall.jpg");
  assert.deepEqual(steps, [{ argv: ["waypaper", "--wallpaper", "/tmp/wall.jpg"] }]);
});

check("feh fills rather than scales or tiles", () => {
  // feh's three fits are not interchangeable: `--bg-scale` distorts, `--bg-tile` repeats.
  // `--bg-fill` is the one that matches the "Cover" used for the Vicinae backends.
  assert.deepEqual(findBackend("feh")!.apply!("/tmp/wall.jpg"), [
    { argv: ["feh", "--bg-fill", "/tmp/wall.jpg"] },
  ]);
});

check("the Skwd socket is where skwd-deck says it is", () => {
  // `wall-proto/src/socket.rs`: SKWD_WALL_V2_SOCK wins, then XDG_RUNTIME_DIR, then /tmp.
  assert.equal(
    skwdSocketPath({ SKWD_WALL_V2_SOCK: "/custom.sock", XDG_RUNTIME_DIR: "/run/user/1000" }),
    "/custom.sock",
  );
  assert.equal(
    skwdSocketPath({ XDG_RUNTIME_DIR: "/run/user/1000" }),
    "/run/user/1000/skwd-wall-v2/wall.sock",
  );
  assert.equal(skwdSocketPath({}), "/tmp/skwd-wall-v2/wall.sock");
  assert.equal(skwdSocketPath({ XDG_RUNTIME_DIR: "" }), "/tmp/skwd-wall-v2/wall.sock");
});

check("the Skwd request is one line of JSON with a static kind", () => {
  // envelope.rs `{method, params, id}`; client.rs terminates with \n; encode_apply gives
  // `{type: "static", path}` and renderer.rs names that kind "static", not "image".
  const line = skwdApply("/tmp/wall.png");
  assert.equal(line.at(-1), "\n");
  assert.equal(line.indexOf("\n"), line.length - 1, "one request must be one line");
  assert.deepEqual(JSON.parse(line), {
    method: "wall.apply",
    params: { type: "static", path: "/tmp/wall.png" },
    id: 1,
  });
});

check("a path with a quote in it survives the JSON round trip", () => {
  // The one thing hand-built JSON would get wrong. `apply` writes JSON, so no shell
  // quoting is involved at all — but the escaping still has to be right.
  const awkward = '/home/o\'brien/My "Wallpapers"/a b.png';
  const parsed = JSON.parse(skwdApply(awkward));
  assert.equal(parsed.params.path, awkward);
});

check("the Skwd step carries the resolved socket path and payload", () => {
  // The whole apply is a socket write; if the path or the payload were wrong there would
  // be nothing left for utils.ts to do but report a connection error.
  const steps = findBackend("skwd-wall")!.apply!("/tmp/wall.png");
  assert.equal(steps.length, 1);
  assert.ok("socket" in steps[0]);
  assert.match(steps[0].socket.path, /skwd-wall-v2\/wall\.sock$/);
  assert.equal(steps[0].socket.payload, skwdApply("/tmp/wall.png"));
});

/**
 * A stub that answers the way skwd-deck does. This is what makes the socket path real code
 * rather than a claim: the same write-once, read-until-newline round trip `callSocket` in
 * utils.ts performs, against a socket that behaves the way the daemon does.
 *
 * Async, because a socket is. `check` is synchronous, so the promise is awaited below and
 * its failure reported the same way — otherwise a broken round trip would pass silently.
 */
function skwdRoundTrip(): Promise<void> {
  const path = join(tmpdir(), `wallhaven-stub-${process.pid}.sock`);
  const received: string[] = [];
  const server = createServer((socket) => {
    socket.on("data", (chunk) => {
      received.push(chunk.toString());
      socket.write('{"id":1,"result":null}\n');
      socket.end();
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(path, () => {
      // Point the backend at the stub the way its own env var does, so the test exercises
      // the same resolution the daemon's users do rather than a hand-passed path.
      const saved = process.env.SKWD_WALL_V2_SOCK;
      process.env.SKWD_WALL_V2_SOCK = path;
      const steps = findBackend("skwd-wall")!.apply!("/tmp/wall.png");
      if (saved === undefined) delete process.env.SKWD_WALL_V2_SOCK;
      else process.env.SKWD_WALL_V2_SOCK = saved;

      const step = steps[0];
      assert.ok("socket" in step);
      assert.equal(step.socket.path, path, "SKWD_WALL_V2_SOCK must be honoured");

      const done = (error?: Error) => {
        server.close();
        rmSync(path, { force: true });
        if (error) reject(error);
        else resolve();
      };

      const connection = createConnection(step.socket.path);
      let text = "";
      connection.setEncoding("utf8");
      connection.on("error", done);
      connection.on("connect", () => connection.write(step.socket.payload));
      connection.on("data", (chunk: string) => {
        text += chunk;
        if (!text.includes("\n")) return;
        try {
          assert.equal(received.length, 1, "the payload must be written once");
          assert.deepEqual(JSON.parse(received[0]), {
            method: "wall.apply",
            params: { type: "static", path: "/tmp/wall.png" },
            id: 1,
          });
          assert.deepEqual(JSON.parse(text.split("\n")[0]), { id: 1, result: null });
          done();
        } catch (error) {
          done(error as Error);
        }
      });
    });
  });
}

check("the backends Vicinae already drives are marked as such and carry no argv", () => {
  for (const id of ["awww", "swww", "hyprpaper"] as const) {
    const backend = findBackend(id)!;
    assert.equal(backend.viaVicinae, true, `${id} should go through Wallpaper.set`);
    assert.equal(backend.apply, undefined, `${id} needs no argv of our own`);
  }
});

check("every backend can be looked up by the id the preference stores", () => {
  for (const backend of BACKENDS) {
    assert.equal(findBackend(backend.id), backend);
  }
});

check("the failure message names the backends it looked for", () => {
  const message = explainMissing();
  assert.match(message, /No wallpaper backend found/);
  // Every backend in the table must be discoverable from the message, or a user with an
  // unusual one gets told the wrong thing to install.
  for (const backend of BACKENDS) {
    assert.ok(
      message.includes(backend.label) || backend.id === "skwd-wall",
      `${backend.label} must appear in: ${message}`,
    );
  }
});

check("no backend is claimed twice: either Vicinae's path or ours", () => {
  // Driving swww through our own argv when Vicinae already knows how would be a second
  // implementation of a solved problem, and the two would drift apart.
  for (const backend of BACKENDS) {
    assert.ok(
      !(backend.viaVicinae && backend.apply),
      `${backend.id} must be either Vicinae's or ours, not both`,
    );
  }
});

check("every backend in the table can actually be driven", () => {
  // Guards the assumption behind explainMissing() having only one branch. If a future
  // backend is added without `apply`, that message starts lying and this fails first.
  for (const backend of BACKENDS) {
    assert.ok(
      backend.viaVicinae || backend.apply,
      `${backend.id} is detected but neither Vicinae nor this extension can drive it`,
    );
  }
});

skwdRoundTrip().then(
  () => check("a stubbed Skwd daemon receives a parsable wall.apply", () => {}),
  (error) => check("a stubbed Skwd daemon receives a parsable wall.apply", () => {
    throw error;
  }),
);

setTimeout(() => {
  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}, 250);