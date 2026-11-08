import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { alertScript, systemdCommand } from "../src/utils/alert.ts";
import { addSource, clampVolume, links, mpvArgs, nameOf, removeSource, replaceSource, summary, type Source } from "../src/utils/music.ts";
import { formatDuration, parseDuration } from "../src/utils/parse.ts";
import { alive } from "../src/utils/process.ts";
import { shellQuote } from "../src/utils/shell.ts";

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

check("a typed duration and its note are read the way the fork read them", () => {
  assert.deepEqual(parseDuration("25m Pomodoro"), { seconds: 1500, note: "Pomodoro" });
  assert.deepEqual(parseDuration("5m Check laundry"), { seconds: 300, note: "Check laundry" });
  assert.deepEqual(parseDuration("1:30"), { seconds: 90, note: "Timer" });
  assert.deepEqual(parseDuration("1:02:03 Tea"), { seconds: 3723, note: "Tea" });
  assert.deepEqual(parseDuration("90"), { seconds: 5400, note: "Timer" });
  assert.deepEqual(parseDuration("45s"), { seconds: 45, note: "Timer" });
  assert.deepEqual(parseDuration("2h"), { seconds: 7200, note: "Timer" });
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("soon"), null);
  assert.equal(parseDuration("5")?.seconds, 300);
  assert.deepEqual(parseDuration("  "), null);
});

check("the countdown is shown as the fork showed it", () => {
  assert.equal(formatDuration(90), "1:30");
  assert.equal(formatDuration(300), "5:00");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(-3), "0:00");
});

check("a value survives a trip through sh, quotes and dollars included", () => {
  for (const value of ["It's tea", `$(touch /tmp/nope)`, `a "b" c`, `back\\slash`, ""]) {
    const result = spawnSync("sh", ["-c", `printf %s ${shellQuote(value)}`], { encoding: "utf8" });
    assert.equal(result.stdout, value);
  }
});

check("the alarm script notifies with the exact note, stops the music and plays the sound", () => {
  const dir = mkdtempSync(join(tmpdir(), "timer-alert-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const stub = (name: string, body: string) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  };
  stub("notify-send", `printf '%s\\n' "$@" > ${join(dir, "notify")}`);
  stub("paplay", `printf played > ${join(dir, "sound")}`);

  const music = spawn("sleep", ["30"], { stdio: "ignore" });
  const pidFile = join(dir, "music.pid");
  writeFileSync(pidFile, `${music.pid}\n`);
  const note = `It's "tea" $(date) time`;

  try {
    const script = alertScript({
      note,
      sound: "/nonexistent/alarm.wav",
      stopFlag: join(dir, "stop"),
      musicPidFile: pidFile,
      repeat: false,
    });
    const run = spawnSync("sh", ["-c", script], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
    assert.equal(run.status, 0);

    const args = readFileSync(join(dir, "notify"), "utf8").trim().split("\n");
    assert.equal(args[args.length - 1], note);
    assert.equal(readFileSync(join(dir, "sound"), "utf8"), "played");
    assert.equal(existsSync(pidFile), false);

    for (let attempt = 0; attempt < 50 && alive(music.pid ?? null); attempt++) {
      spawnSync("sleep", ["0.02"]);
    }
    assert.equal(alive(music.pid ?? null), false);
  } finally {
    music.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  }
});

check("the repeating alarm waits for the stop flag; the once alarm does not", () => {
  const base = { note: "Tea", sound: "/a b/alarm.wav", stopFlag: "/tmp/stop flag", musicPidFile: "/tmp/pid" };
  const once = alertScript({ ...base, repeat: false });
  const until = alertScript({ ...base, repeat: true });
  assert.ok(!once.includes("while"));
  assert.ok(until.includes(`while [ ! -f ${shellQuote(base.stopFlag)} ]`));
  assert.ok(until.includes(shellQuote(base.sound)));
});

check("systemd is asked for the delay and the script is one quoted argument", () => {
  const command = systemdCommand(90, "vicinae-timer-1", "echo hi");
  assert.match(command, /^systemd-run --user --on-active=90s --timer-property=AccuracySec=1s --unit=vicinae-timer-1 /);
  assert.equal(command.endsWith(`-- /usr/bin/env bash -c ${shellQuote("echo hi")}`), true);
  assert.match(systemdCommand(0.2, "vicinae-timer-2", "x"), /--on-active=1s /);
});

check("an entry holds one link or several, and blanks are dropped", () => {
  assert.deepEqual(links("rain.oga"), ["rain.oga"]);
  assert.deepEqual(links("https://a\n  /home/you/b.ogg  \n\n"), ["https://a", "/home/you/b.ogg"]);
  assert.deepEqual(links("   "), []);
  assert.equal(summary("rain.oga"), "rain.oga");
  assert.equal(summary("rain.oga\nhttps://example.com/b"), "rain.oga · +1 more");
});

check("mpv gets every link after --, never as an option, and loops the playlist", () => {
  const args = mpvArgs("https://example.com/x", 40, "/ext/assets");
  assert.equal(args[args.length - 2], "--");
  assert.equal(args[args.length - 1], "https://example.com/x");
  assert.ok(args.includes("--volume=40"));
  assert.ok(args.includes("--loop-playlist=inf"));
  assert.ok(!args.includes("--loop-file=inf"));
  assert.equal(mpvArgs("rain.oga", 60, "/ext/assets")[6], "/ext/assets/rain.oga");
  assert.equal(mpvArgs("/home/you/rain.ogg", 60, "/ext/assets")[6], "/home/you/rain.ogg");
  assert.equal(mpvArgs("av://lavfi:anoisesrc=color=brown", 60, "/ext/assets")[6], "av://lavfi:anoisesrc=color=brown");

  const playlist = mpvArgs("rain.oga\nhttps://example.com/b", 60, "/ext/assets");
  assert.equal(playlist[playlist.indexOf("--") + 1], "/ext/assets/rain.oga");
  assert.equal(playlist[playlist.indexOf("--") + 2], "https://example.com/b");
  assert.ok(mpvArgs("x", 999, "/a").includes("--volume=100"));
  assert.equal(clampVolume("loud"), 60);
});

check("playlists are edited, de-duplicated and removed without disturbing the rest", () => {
  const base: Source[] = [
    { name: "Rain", url: "rain.oga" },
    { name: "Mine", url: "https://example.com/mine" },
  ];
  const added = addSource(base, { name: "Other", url: "https://example.com/other" });
  assert.equal(added.length, 3);
  assert.equal(added[added.length - 1]?.name, "Other");

  const renamed = addSource(base, { name: "Storm", url: "rain.oga" });
  assert.equal(renamed.length, 2);
  assert.equal(renamed[0]?.name, "Storm");

  const edited = replaceSource(base, "rain.oga", { name: "Drizzle", url: "rain.oga\n/home/you/x.ogg" });
  assert.deepEqual(edited[0], { name: "Drizzle", url: "rain.oga\n/home/you/x.ogg" });
  assert.equal(edited[1]?.name, "Mine");
  assert.equal(removeSource(base, "rain.oga").length, 1);
  assert.equal(nameOf(base, "rain.oga"), "Rain");
  assert.equal(nameOf(base, "https://example.com/gone"), "https://example.com/gone");
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
