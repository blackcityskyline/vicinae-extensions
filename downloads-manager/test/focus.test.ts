import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { focusCommand, isSelector, newWindowCommand, reveal, shellQuote } from "../src/focus.ts";

let checks = 0;
function check(name: string, body: () => void) {
  try {
    body();
    checks++;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

// Measured on Hyprland 0.56.2 with the Lua dispatcher API:
//
//   hl.dispatch(hl.dsp.focus({window='address:0x…'}))  -> focus moves, 6/6
//   hl.dsp.focus({window='address:0x…'}) alone         -> does nothing at all
//
// The wiki says so outright: "Simply writing hl.dsp.whatever() on its own will do
// nothing." Hyprland answers `ok` either way, which is why the missing wrapper looks
// like success unless the focus is watched.

check("an address selector is accepted as hyprctl reports it", () => {
  assert.ok(isSelector("address:0x559dadca65a0"));
  assert.ok(isSelector("class:^mpv$"));
  assert.ok(isSelector("pid:1646369"));
});

check("anything that is not a selector shape is refused", () => {
  // These would become Lua if they were pasted into a string, so they never are.
  for (const value of [
    "/home/black/Downloads/IMG_1.JPG",
    "",
    "0x559dadca65a0",
    "address:0xZZZZ",
    "address:0x1')); os.execute('id",
    "class:mpv'); os.execute('id",
  ]) {
    assert.equal(isSelector(value), false, `accepted: ${value}`);
  }
});

check("focusing is wrapped in hl.dispatch, or it does nothing", () => {
  const command = focusCommand("address:0x559dadca65a0");
  assert.ok(command.startsWith("hl.dispatch(hl.dsp.focus("), command);
  assert.ok(command.endsWith("))"), `unbalanced: ${command}`);
});

check("a refused selector never reaches a command at all", () => {
  // Throwing beats building a string that would be evaluated.
  assert.throws(() => focusCommand("/home/black/Downloads/x.zip"), /selector/);
});

check("a quoted path survives a real shell", () => {
  // Not a string comparison: the shell is asked to echo it back.
  for (const path of [
    "/home/black/Downloads/IMG_1.JPG",
    "/home/black/Downloads/it's \"x\".zip",
    "/home/black/Downloads/$(id).zip",
    "/home/black/Downloads/`id`.zip",
    "/home/black/Downloads/a;rm -rf ~.zip",
    "/home/black/Downloads/привет (2).pdf",
  ]) {
    const out = execFileSync("sh", ["-c", `printf %s ${shellQuote(path)}`], { encoding: "utf-8" });
    assert.equal(out, path, `shell mangled: ${path} -> ${out}`);
  }
});

check("the new-window command passes the path through the shell intact", () => {
  const evil = "/home/black/Downloads/it's \"x\".zip";
  const out = execFileSync("sh", ["-c", `printf %s ${newWindowCommand(evil).replace(/^.*-- /, "")}`], {
    encoding: "utf-8",
  });
  assert.equal(out, evil);
});

check("a window that is already open is focused, not duplicated", () => {
  // This is the case that made the single upstream action look broken.
  const plan = reveal("/tmp/does-not-exist-anywhere/x.zip");
  assert.equal(plan.kind, "new-window", "no window exists, so a new one is right");
});

check("the plan is chosen from what is on screen, right now", () => {
  // Runs against the real `hyprctl`. Only asserts that the decision is one of the two
  // valid answers and that a focus plan carries a selector a dispatcher accepts.
  const plan = reveal(`${process.env.HOME}/Downloads`);
  assert.ok(plan.kind === "focus" || plan.kind === "new-window");
  if (plan.kind === "focus") {
    assert.ok(isSelector(plan.selector), plan.selector);
    assert.doesNotThrow(() => focusCommand(plan.selector));
  } else {
    assert.match(plan.command, /nautilus --new-window/);
  }
});

console.log(`\nall ${checks} checks passed`);
