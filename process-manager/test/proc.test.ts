import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  collect,
  cpuPercent,
  humanBytes,
  humanElapsed,
  matchProcesses,
  order,
  parseCommand,
  parseCpuTotals,
  parseIo,
  parsePasswd,
  parseStat,
  percent,
  stateWord,
  type ProcessInfo,
} from "../src/proc.ts";

let passed = 0;
let failed = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function row(pid: number, cpu: number, memBytes: number): ProcessInfo {
  return {
    pid,
    ppid: 1,
    name: `p${pid}`,
    command: `p${pid}`,
    path: "",
    user: "black",
    state: "Sleeping",
    cpu,
    memBytes,
    threads: 1,
    nice: 0,
    startedAt: 0,
    elapsed: 0,
  };
}

async function main() {
  // A real name, taken from a Chromium renderer: it holds both a space and a
  // closing parenthesis, which is exactly what a split on "(" gets wrong.
  await check("parseStat: a name with spaces and parens does not shift the fields", () => {
    const fields = parseStat(
      "1234 (Web Content (tab 2)) S 1 1234 1234 0 -1 4194560 1000 0 0 0 100 50 0 0 20 0 12 0 5000 100 300 1500",
    );
    assert.ok(fields !== null);
    assert.equal(fields.pid, 1234);
    assert.equal(fields.name, "Web Content (tab 2)");
    assert.equal(fields.state, "S");
    assert.equal(fields.ppid, 1);
    assert.equal(fields.ticks, 150);
    assert.equal(fields.nice, 0);
    assert.equal(fields.threads, 12);
    assert.equal(fields.starttime, 5000);
    assert.equal(fields.rssPages, 300);
  });

  await check("parseStat: the kernel's own answer for this pid", () => {
    const fields = parseStat(readFileSync(`/proc/${process.pid}/stat`, "utf8"));
    assert.ok(fields !== null);
    assert.equal(fields.pid, process.pid);
    assert.equal(fields.name, readFileSync("/proc/self/comm", "utf8").trim());
    assert.equal(fields.ppid, process.ppid);
  });

  await check("parseStat: a truncated line is refused, not guessed at", () => {
    assert.equal(parseStat("1234 (broken"), null);
    assert.equal(parseStat(""), null);
  });

  await check("parseCpuTotals: the total line sums its first eight counters", () => {
    const totals = parseCpuTotals(
      [
        "cpu  1 2 3 4 5 6 7 8 9 10",
        "cpu0 1 2 3 4 5 6 7 8 9 10",
        "btime 1700000000",
        "intr 12345",
        "",
      ].join("\n"),
    );
    assert.equal(totals.jiffies, 36);
    assert.equal(totals.bootTime, 1700000000);
  });

  await check("cpuPercent: one saturated core reads 100%, and nothing exceeds the machine", () => {
    assert.equal(cpuPercent(0, 100, 8), 0);
    assert.equal(cpuPercent(100, 0, 8), 0);
    assert.equal(cpuPercent(100, 800, 8), 100);
    assert.equal(cpuPercent(50, 800, 8), 50);
    assert.equal(cpuPercent(1000, 800, 8), 800);
  });

  await check("parseCommand: argv is one line, and a kernel thread shows its name", () => {
    assert.equal(
      parseCommand("firefox\0--new-window\0https://example.com\0", "firefox"),
      "firefox --new-window https://example.com",
    );
    assert.equal(parseCommand("\0\0", "kworker/0:1"), "[kworker/0:1]");
  });

  await check("parseIo: the counters btop shows as IO/R and IO/W", () => {
    assert.deepEqual(
      parseIo(
        [
          "rchar: 500",
          "wchar: 700",
          "syscr: 9",
          "syscw: 8",
          "read_bytes: 4096",
          "write_bytes: 0",
        ].join("\n"),
      ),
      { read: 4096, write: 0 },
    );
  });

  await check("parsePasswd: uid to name, the way libc resolves it", () => {
    const users = parsePasswd(
      "root:x:0:0::/root:/bin/bash\nblack:x:1000:1000::/home/black:/bin/fish\nbroken\n",
    );
    assert.equal(users.get(0), "root");
    assert.equal(users.get(1000), "black");
    assert.equal(users.size, 2);
  });

  await check("stateWord: btop's words, and a letter it does not know", () => {
    assert.equal(stateWord("R"), "Running");
    assert.equal(stateWord("S"), "Sleeping");
    assert.equal(stateWord("Z"), "Zombie");
    assert.equal(stateWord("I"), "Idle");
    assert.equal(stateWord("?"), "Unknown");
  });

  await check("percent: two decimals below ten, one below a hundred, none above", () => {
    assert.equal(percent(0), "0.00%");
    assert.equal(percent(9.994), "9.99%");
    assert.equal(percent(21.57), "21.6%");
    assert.equal(percent(99.95), "100%");
    assert.equal(percent(340.2), "340%");
  });

  await check("humanBytes: binary units, and no trailing zeros", () => {
    assert.equal(humanBytes(0), "0 B");
    assert.equal(humanBytes(512), "512 B");
    assert.equal(humanBytes(1024), "1 KiB");
    assert.equal(humanBytes(1024 * 1024 * 250), "250 MiB");
    assert.equal(humanBytes(90749177), "86.5 MiB");
  });

  await check("humanElapsed: days only when there are days", () => {
    assert.equal(humanElapsed(0), "00:00:00");
    assert.equal(humanElapsed(3725), "01:02:05");
    assert.equal(humanElapsed(90061), "1d 01:01:01");
  });

  await check("order: the chosen column first, the pid settles the rest", () => {
    const rows = [row(3, 0, 900), row(1, 50, 100), row(2, 0, 900)];
    assert.deepEqual(
      order(rows, "cpu").map((each) => each.pid),
      [1, 2, 3],
    );
    assert.deepEqual(
      order(rows, "memory").map((each) => each.pid),
      [2, 3, 1],
    );
  });

  await check("matchProcesses: the name or the executable, never a mention", () => {
    const rows = [
      { ...row(1, 0, 0), name: "zen-bin", command: "/opt/zen-browser-bin/zen-bin" },
      {
        ...row(2, 0, 0),
        name: "vim",
        command: "vim notes-on-firefox.txt",
        path: "/usr/bin/vim",
      },
      { ...row(3, 0, 0), name: "bash", command: "bash -c 'pgrep zen'", path: "/usr/bin/bash" },
    ];
    assert.deepEqual(
      matchProcesses(rows, "zen-bin").map((each) => each.pid),
      [1],
    );
    // The executable is `/opt/zen-browser-bin/zen-bin`, so `zen` is not it.
    assert.deepEqual(
      matchProcesses(rows, "zen").map((each) => each.pid),
      [],
    );
    // `firefox` is a file name in vim's arguments, not a process.
    assert.deepEqual(matchProcesses(rows, "firefox"), []);
    assert.deepEqual(matchProcesses(rows, "   "), []);
  });

  await check("collect: the kernel's table, read twice", () => {
    const first = collect();
    const second = collect(first.sample);
    const self = second.processes.find((each) => each.pid === process.pid);
    assert.ok(self !== undefined);
    assert.equal(self.name, readFileSync("/proc/self/comm", "utf8").trim());
    assert.equal(self.user, process.env.USER ?? self.user);
    assert.ok(self.memBytes > 0);
    assert.ok(second.processes.length > 1);
    assert.ok(second.processes.every((each) => each.name !== "" && each.cpu >= 0));
    assert.equal(second.sample.ticks.size, second.processes.length);
  });

  console.log(
    failed === 0 ? `\n${passed} checks passed` : `\n${passed} passed, ${failed} failed`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
