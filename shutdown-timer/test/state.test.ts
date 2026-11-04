import assert from "node:assert/strict";

import { addHistory, decodeHistory, decodeSchedules, sortSchedules } from "~/utils/state";

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

check("an absent key is an empty list, not a crash", () => {
  // Measured on @vicinae/api 0.29: LocalStorage.getItem resolves with null on a
  // fresh install, not undefined, and JSON.parse(null) is null rather than a throw.
  for (const stored of [null, undefined, "", "null"]) {
    assert.deepEqual(decodeSchedules(stored), [], `stored ${JSON.stringify(stored)}`);
    assert.deepEqual(decodeHistory(stored), [], `stored ${JSON.stringify(stored)}`);
  }
});

check("a value that is not our JSON is ignored", () => {
  for (const stored of ['{"a":1}', "[1,2,3]", '"poweroff"', "[{\"nope\":1}]"]) {
    assert.deepEqual(decodeSchedules(stored), [], stored);
  }
});

const record = {
  id: 1_762_000_000,
  action: "poweroff" as const,
  dueEpochSec: 1_762_001_800,
  armedAtSec: 1_762_000_000,
  dryRun: false,
};

const event = (n: number) => ({ at: 1_000 + n, action: "poweroff", outcome: "armed", detail: `#${n}` });

check("a stored schedule survives the round trip", () => {
  const [only] = decodeSchedules(JSON.stringify([record]));
  assert.deepEqual(only, record);
});

check("the sooner one sorts first", () => {
  const later = { ...record, id: 2, dueEpochSec: 1_762_090_000 };
  const soonest = { ...record, id: 3, dueEpochSec: 1_762_000_900, action: "reboot" as const };
  const sorted = sortSchedules([later, soonest]);
  assert.deepEqual(sorted.map((entry) => entry.id), [3, 2]);
});

check("history is newest first and capped", () => {
  let history = decodeHistory("[]");
  for (let n = 0; n < 30; n += 1) history = addHistory(history, event(n), 10);

  assert.equal(history.length, 10);
  assert.equal(history[0]?.detail, "#29");
  assert.equal(history[9]?.detail, "#20");
});

check("history that is over the limit is trimmed, not kept", () => {
  const long = Array.from({ length: 25 }, (_, n) => event(n));
  const trimmed = addHistory(long, event(99), 10);
  assert.equal(trimmed.length, 10);
  assert.equal(trimmed[0]?.detail, "#99");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
