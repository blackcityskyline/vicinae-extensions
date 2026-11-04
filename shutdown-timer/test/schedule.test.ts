import assert from "node:assert/strict";

import { dueAt, formatClock, formatCountdown, parseSchedule } from "~/utils/schedule";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function seconds(text: string): number | undefined {
  const parsed = parseSchedule(text);
  return parsed.schedule?.mode === "relative" ? parsed.schedule.seconds : undefined;
}

function errorOf(text: string): string | undefined {
  return parseSchedule(text).error;
}

check("a bare number is minutes", () => {
  assert.equal(seconds("30"), 1800);
  assert.equal(seconds("1"), 60);
});

check("unit suffixes are durations", () => {
  assert.equal(seconds("45m"), 2700);
  assert.equal(seconds("2h"), 7200);
  assert.equal(seconds("90s"), 90);
  assert.equal(seconds("1h30m"), 5400);
  assert.equal(seconds("1H 30M"), 5400);
});

check("24 hours is the longest timer", () => {
  assert.equal(seconds("1440"), 86400);
  assert.match(errorOf("1441") ?? "", /24 hours/);
});

check("a colon means a clock time, not a duration", () => {
  assert.deepEqual(parseSchedule("23:30").schedule, { mode: "clock", hour: 23, minute: 30 });
  assert.deepEqual(parseSchedule("7:05").schedule, { mode: "clock", hour: 7, minute: 5 });
});

check("out-of-range clock times are refused", () => {
  assert.match(errorOf("24:00") ?? "", /clock time/);
  assert.match(errorOf("23:60") ?? "", /clock time/);
  assert.match(errorOf("7:5") ?? "", /clock time/);
});

check("nothing typed is not a silent default", () => {
  assert.match(errorOf("") ?? "", /Enter a time/);
  assert.match(errorOf("soon") ?? "", /could not read/);
  assert.match(errorOf("5 minutes") ?? "", /could not read/);
});

// Local wall time fixtures: Tue 2026-11-03, 14:00.
const now = new Date(2026, 10, 3, 14, 0, 0).getTime();

check("a clock time still ahead today lands today", () => {
  const due = dueAt({ mode: "clock", hour: 23, minute: 30 }, now);
  assert.equal(due, new Date(2026, 10, 3, 23, 30, 0).getTime());
});

check("a clock time already past lands tomorrow", () => {
  const due = dueAt({ mode: "clock", hour: 3, minute: 0 }, now);
  assert.equal(due, new Date(2026, 10, 4, 3, 0, 0).getTime());
});

check("a relative schedule lands that many seconds ahead", () => {
  assert.equal(dueAt({ mode: "relative", seconds: 1800 }, now), now + 1800 * 1000);
});

check("countdown is minutes and seconds below an hour", () => {
  assert.equal(formatCountdown(522_000), "8:42");
  assert.equal(formatCountdown(60_000), "1:00");
  assert.equal(formatCountdown(999), "0:01");
});

check("countdown never shows a negative or a zero while alive", () => {
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(formatCountdown(-5_000), "0:00");
});

check("countdown grows an hour field past 59 minutes", () => {
  assert.equal(formatCountdown(3_600_000), "1:00:00");
  assert.equal(formatCountdown(86_400_000), "24:00:00");
});

check("clock labels are 24-hour and locale-independent", () => {
  assert.equal(formatClock(new Date(2026, 10, 3, 4, 9, 0).getTime()), "04:09");
  assert.equal(formatClock(new Date(2026, 10, 3, 23, 30, 0).getTime()), "23:30");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
