import assert from "node:assert/strict";

import { mergeHistories, parseBash, parseZsh, type Entry } from "../src/utils/history.ts";
import { formatTimestamp } from "../src/utils/time.ts";

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
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

/** A local-time instant, so the checks do not depend on this machine's zone. */
function at(year: number, month: number, day: number, hour: number, minute: number): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

// `toLocaleString()` with no locale gave "3/10/2026, 4:59:12 AM" here: month
// first, and a twelve-hour clock. Day first and 24-hour is what a European
// reader reads without a second thought.
check("a timestamp is day first, year last, 24-hour", () => {
  assert.equal(formatTimestamp(at(2026, 3, 10, 4, 59)), "10.03.2026 04:59");
  assert.equal(formatTimestamp(at(2026, 9, 30, 19, 21)), "30.09.2026 19:21");
});

check("midnight is 00:00, not 12:00 AM", () => {
  assert.equal(formatTimestamp(at(2026, 1, 1, 0, 0)), "01.01.2026 00:00");
  assert.equal(formatTimestamp(at(2026, 12, 31, 23, 59)), "31.12.2026 23:59");
});

check("every part is padded to two digits", () => {
  assert.equal(formatTimestamp(at(2026, 2, 3, 4, 5)), "03.02.2026 04:05");
});

check("the format does not move with the machine's locale", () => {
  const rendered = formatTimestamp(at(2026, 7, 4, 13, 5));
  assert.equal(rendered, "04.07.2026 13:05");
  assert.ok(!/AM|PM/i.test(rendered), "no twelve-hour clock");
  assert.equal(rendered.slice(0, 2), "04", "the day comes first");
});

check("an entry with no timestamp says so instead of guessing a date", () => {
  assert.equal(formatTimestamp(undefined), "—");
});

// The cap used to take the first N of each history, which for a file written in
// chronological order is the oldest N — so the most recent months were the ones
// that disappeared.
check("the newest entries are the ones kept when a history is too long", () => {
  const CAP = 3;
  const history: Entry[] = Array.from({ length: 10 }, (_, index) => ({
    command: `cmd-${index}`,
    when: at(2026, 1, 1 + index, 0, 0),
    shell: "fish" as const,
  }));

  const kept = history.slice(-CAP);
  assert.deepEqual(kept.map((entry) => entry.command), ["cmd-7", "cmd-8", "cmd-9"]);
  assert.equal(mergeHistories([kept])[0]?.command, "cmd-9");
});

check("entries with no timestamp come last, newest file order first", () => {
  const merged = mergeHistories([
    [{ command: "older bash", when: undefined, shell: "bash" }],
    [{ command: "newer bash", when: undefined, shell: "bash" }],
    [{ command: "dated", when: at(2026, 1, 1, 0, 0), shell: "fish" }],
  ]);
  assert.deepEqual(merged.map((entry) => entry.command), ["dated", "older bash", "newer bash"]);
});

check("a bash entry with no timestamp still parses", () => {
  assert.deepEqual(parseBash("ls")[0]?.when, undefined);
  assert.deepEqual(parseZsh("ls")[0]?.when, undefined);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
