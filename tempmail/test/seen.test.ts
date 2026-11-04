import assert from "node:assert/strict";

import { newMailTitle, senderLabel, unreported } from "../src/utils/seen.ts";

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

const mail = (...ids: string[]) => ids.map((id) => ({ id }));

check("the first look at an inbox never notifies", () => {
  // Nothing has been reported yet, so every message is unknown. Upstream keeps
  // the same rule (`inboxLoaded`), and for the same reason: a poll that starts
  // on a full inbox would cry wolf about mail that arrived an hour ago.
  assert.deepEqual(unreported(mail("a", "b"), null), []);
});

check("a message nobody has been told about is new", () => {
  assert.deepEqual(unreported(mail("b", "a"), ["a"]), [{ id: "b" }]);
  assert.deepEqual(unreported(mail("a"), []), [{ id: "a" }]);
});

check("nothing arrived when every id is already reported", () => {
  assert.deepEqual(unreported(mail("b", "a"), ["a", "b"]), []);
  assert.deepEqual(unreported([], ["a"]), []);
});

check("the report keeps the order the inbox came in", () => {
  // The API returns newest first and the notification names the first of them.
  assert.deepEqual(unreported(mail("c", "b", "a"), ["a"]).map((item) => item.id), ["c", "b"]);
});

check("the notification counts, in English", () => {
  assert.equal(newMailTitle(1), "New email");
  assert.equal(newMailTitle(2), "2 new emails");
  assert.equal(newMailTitle(11), "11 new emails");
});

check("a sender is named by display name, or by address when there is none", () => {
  assert.equal(senderLabel("GitHub", "noreply@github.com"), "GitHub");
  assert.equal(senderLabel("  GitHub  ", "noreply@github.com"), "GitHub");
  assert.equal(senderLabel("", "noreply@github.com"), "noreply@github.com");
  assert.equal(senderLabel("", ""), "unknown");
});

console.log(`${checks} checks passed`);
