import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMAND_VAR, LAUNCHABLE, RUN_SCRIPT, SHELL_VAR, TERMINAL_NAMES, XDG_TERMINAL, invocation } from "../src/utils/terminals.ts";

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
    console.log(`     ${(error as Error).message.split("\n").slice(0, 10).join("\n     ")}`);
  }
}

// `npm test` runs from the extension directory.
const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
const dropdown = manifest.preferences.find((pref: { name: string }) => pref.name === "terminal");

// The preference and the table that decides how to talk to each terminal are two
// places, and the failure mode of letting them drift is a dropdown entry that
// silently does nothing.

check("every terminal in the dropdown is one the code knows how to launch", () => {
  const values: string[] = (dropdown.data as { value: string }[]).map((item) => item.value);
  assert.ok(values.length > 0, "the manifest has no terminal dropdown");
  for (const value of values) {
    if (value === "auto") continue;
    assert.ok(LAUNCHABLE.includes(value), `${value} is in the dropdown but not in the table`);
  }
});

check("every terminal the code knows is offered in the dropdown", () => {
  const values: string[] = (dropdown.data as { value: string }[]).map((item) => item.value);
  for (const name of TERMINAL_NAMES) {
    assert.ok(values.includes(name), `${name} is in the table but not in the dropdown`);
  }
});

// auto prefers this one, so it has to be launchable even though nobody picks it.
check("the xdg launcher is launchable without being in the dropdown", () => {
  const values: string[] = (dropdown.data as { value: string }[]).map((item) => item.value);
  assert.ok(!values.includes(XDG_TERMINAL));
  const result = invocation(XDG_TERMINAL, "/usr/bin/xdg-terminal-exec", "/usr/bin/fish", "ls");
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.argv, ["/usr/bin/xdg-terminal-exec", "/usr/bin/fish", "-c", RUN_SCRIPT]);
});

check("foot and kitty take the program directly, with no exec flag", () => {
  for (const terminal of ["foot", "kitty"]) {
    const path = `/usr/bin/${terminal}`;
    const result = invocation(terminal, path, "/usr/bin/fish", "ls");
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.argv, [path, "/usr/bin/fish", "-c", RUN_SCRIPT]);
  }
});

check("alacritty, konsole, ghostty and xterm want -e", () => {
  for (const terminal of ["alacritty", "konsole", "ghostty", "xterm"]) {
    const result = invocation(terminal, `/usr/bin/${terminal}`, "/usr/bin/bash", "ls");
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.argv.slice(1, 3), ["-e", "/usr/bin/bash"]);
  }
});

check("wezterm needs start -- and gnome-terminal needs --", () => {
  const wezterm = invocation("wezterm", "/usr/bin/wezterm", "/usr/bin/bash", "ls");
  assert.equal(wezterm.ok && wezterm.argv.slice(1, 3).join(" "), "start --");

  const gnome = invocation("gnome-terminal", "/usr/bin/gnome-terminal", "/usr/bin/bash", "ls");
  assert.equal(gnome.ok && gnome.argv.slice(1, 2).join(" "), "--");
});

// xfce4-terminal's -e takes one string rather than an argv, and getting that
// wrong passes the script to fish as $0.

check("xfce4-terminal gets its program as one quoted string", () => {
  const result = invocation("xfce4-terminal", "/usr/bin/xfce4-terminal", "/usr/bin/fish", "ls");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // -e takes a single string, so shell and script have to travel together.
  assert.deepEqual(result.argv.slice(0, 2), ["/usr/bin/xfce4-terminal", "-e"]);
  assert.equal(result.argv[2], `'/usr/bin/fish -c ${RUN_SCRIPT}'`);
});

check("the command travels in the environment and never in argv", () => {
  const command = "curl -H 'Authorization: Bearer ghp_secret' https://api";
  const result = invocation("foot", "/usr/bin/foot", "/usr/bin/fish", command);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.env[COMMAND_VAR], command);
  assert.equal(result.env[SHELL_VAR], "/usr/bin/fish");
  // Anything in argv is world-readable through /proc.
  assert.ok(!result.argv.some((part) => part.includes("ghp_secret")));
});

check("the script is fixed and does not contain the command", () => {
  const result = invocation("foot", "/usr/bin/foot", "/usr/bin/fish", "rm -rf /");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(!result.argv.some((part) => part.includes("rm -rf")));
  assert.ok(result.argv.some((part) => part.includes(`$${COMMAND_VAR}`)));
  assert.ok(result.argv.some((part) => part.includes(`$${SHELL_VAR}`)));
});

check("an unknown terminal is refused instead of being spawned", () => {
  const result = invocation("xterm-that-does-not-exist", "/bin/true", "/usr/bin/bash", "ls");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.message.includes("xterm-that-does-not-exist"));
});

check("an empty command is refused", () => {
  const result = invocation("foot", "/usr/bin/foot", "/usr/bin/bash", "   ");
  assert.equal(result.ok, false);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
