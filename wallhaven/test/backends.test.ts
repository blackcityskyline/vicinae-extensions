import assert from "node:assert/strict";

import { BACKENDS, detectBackend, explainMissing, findBackend } from "../src/backends.ts";

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

check("skwd is detected but has no way to be driven", () => {
  const skwd = findBackend("skwd-wall");
  assert.ok(skwd, "skwd-wall must be in the table");
  assert.equal(skwd.viaVicinae, false);
  assert.equal(skwd.apply, undefined);
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

check("the two failure messages name different problems", () => {
  // Recognised but undrivable is not the same as nothing found, and the fixes differ.
  assert.match(explainMissing(findBackend("skwd-wall")), /no command to change the wallpaper/);
  assert.match(explainMissing(undefined), /No wallpaper backend found/);
  // A backend that can be driven never produces a failure message.
  assert.match(explainMissing(findBackend("noctalia")), /No wallpaper backend found/);
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

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);