import assert from "node:assert/strict";

import { markDiskRead, needsDiskRead, read, subscribe, write } from "../src/utils/store.ts";

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

check("an unwritten key reads as its fallback", () => {
  assert.equal(read("nothing-here", 7), 7);
});

check("a write is seen by a second reader immediately", () => {
  // The bug this store exists for: the language set is written by the dropdown in
  // the search bar and read by the list. Per-component state meant the list never
  // saw it, and the target stayed on its default however the dropdown was set.
  const seen: string[] = [];
  const stop = subscribe<string>("set", (value) => seen.push(value));

  write("set", "ru");
  assert.equal(read("set", ""), "ru");
  assert.deepEqual(seen, ["ru"]);

  stop();
});

check("every subscriber is told, not just the writer's own", () => {
  const first: number[] = [];
  const second: number[] = [];
  const stopFirst = subscribe<number>("both", (value) => first.push(value));
  const stopSecond = subscribe<number>("both", (value) => second.push(value));

  write("both", 1);
  write("both", 2);

  assert.deepEqual(first, [1, 2]);
  assert.deepEqual(second, [1, 2]);

  stopFirst();
  stopSecond();
});

check("a subscriber that has gone is not called again", () => {
  const kept: string[] = [];
  const dropped: string[] = [];
  const stopKept = subscribe<string>("unsubscribe", (value) => kept.push(value));
  const stopDropped = subscribe<string>("unsubscribe", (value) => dropped.push(value));

  stopDropped();
  write("unsubscribe", "x");
  write("unsubscribe", "y");

  assert.deepEqual(kept, ["x", "y"]);
  assert.deepEqual(dropped, []);

  stopKept();
});

check("a value written before anyone subscribed is still there", () => {
  write("early", "written first");
  const seen: string[] = [];
  const stop = subscribe<string>("early", (value) => seen.push(value));

  // Reading is not listening, so no call is expected — but the value must be there.
  assert.equal(read("early", "gone"), "written first");
  assert.deepEqual(seen, []);

  write("early", "written again");
  assert.deepEqual(seen, ["written again"]);

  stop();
});

check("two keys do not see each other", () => {
  const a: string[] = [];
  const b: string[] = [];
  const stopA = subscribe<string>("key-a", (value) => a.push(value));
  const stopB = subscribe<string>("key-b", (value) => b.push(value));

  write("key-a", "1");

  assert.deepEqual(a, ["1"]);
  assert.deepEqual(b, []);

  stopA();
  stopB();
});

check("the disk is read once per key, however many hooks mount", () => {
  assert.equal(needsDiskRead("fresh"), true);
  markDiskRead("fresh");
  assert.equal(needsDiskRead("fresh"), false);

  // A key read before is not read again; a new one still is.
  assert.equal(needsDiskRead("another"), true);
});

console.log(`\nall ${checks} checks passed`);