import assert from "node:assert/strict";

import { quickSchedule } from "../src/utils/quick.ts";

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

function schedule(input: string): string {
  const result = quickSchedule(input);
  if (!result.ok) throw new Error(`${JSON.stringify(input)} was not understood`);
  return result.schedule;
}

function rejected(input: string): void {
  assert.equal(quickSchedule(input).ok, false, `${JSON.stringify(input)} should not be understood`);
}

check("minutes are a step on the minute field", () => {
  assert.equal(schedule("5m"), "*/5 * * * *");
  assert.equal(schedule("every 5 minutes"), "*/5 * * * *");
  assert.equal(schedule("15 min"), "*/15 * * * *");
});

check("hours are a step on the hour field, and the minute stays zero", () => {
  assert.equal(schedule("2h"), "0 */2 * * *");
  assert.equal(schedule("every 3 hours"), "0 */3 * * *");
});

check("a bare time is every day at that time", () => {
  assert.equal(schedule("09:30"), "30 9 * * *");
  assert.equal(schedule("9:05"), "5 9 * * *");
});

check("daily repeats the same time with every day", () => {
  assert.equal(schedule("daily"), "0 0 * * *");
  assert.equal(schedule("daily 07:15"), "15 7 * * *");
});

check("weekdays covers Monday through Friday", () => {
  assert.equal(schedule("weekdays"), "0 0 * * 1-5");
  assert.equal(schedule("weekdays 18:00"), "0 18 * * 1-5");
});

check("weekly takes one day, by name", () => {
  assert.equal(schedule("weekly"), "0 0 * * 1");
  assert.equal(schedule("weekly sat"), "0 0 * * 6");
  assert.equal(schedule("weekly mon 09:30"), "30 9 * * 1");
  assert.equal(schedule("weekly wednesday 23:59"), "59 23 * * 3");
});

check("monthly takes a day of the month", () => {
  assert.equal(schedule("monthly"), "0 0 1 * *");
  assert.equal(schedule("monthly 15"), "0 0 15 * *");
  assert.equal(schedule("monthly 1 04:30"), "30 4 1 * *");
});

check("the crontab aliases are passed through untouched", () => {
  assert.equal(schedule("@daily"), "@daily");
  assert.equal(schedule("@reboot"), "@reboot");
});

check("nonsense is refused rather than guessed at", () => {
  rejected("");
  rejected("soon");
  rejected("5");
  rejected("60m");
  rejected("24h");
  rejected("25:00");
  rejected("weekly someday 9:00");
  rejected("daily 9:00 9:00");
  rejected("monthly 32");
});

check("surrounding space and case do not matter", () => {
  assert.equal(schedule("  Every 5 Minutes  "), "*/5 * * * *");
  assert.equal(schedule("DAILY 09:30"), "30 9 * * *");
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
