import assert from "node:assert/strict";

import { apiError, isAddressSafe, randomUsername, unwrap, unwrapAll } from "../src/utils/mail.ts";

let checks = 0;
const pending: Promise<void>[] = [];

// The paging checks below are async, and a runner that does not await them lets
// them pass without asserting anything.
function check(name: string, body: () => void | Promise<void>): void {
  pending.push(
    (async () => {
      try {
        await body();
        checks++;
        console.log(`ok   ${name}`);
      } catch (error) {
        console.log(`FAIL ${name}`);
        console.log(`     ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
      }
    })(),
  );
}

const COLLECTION = {
  "hydra:totalItems": 2,
  "hydra:member": [
    { id: "a", subject: "one" },
    { id: "b", subject: "two" },
  ],
};

check("a hydra collection is unwrapped to its members", () => {
  assert.deepEqual(unwrap(COLLECTION as never), COLLECTION["hydra:member"]);
});

check("unwrap answers with an array whatever it is given", () => {
  assert.deepEqual(unwrap([{ id: "a" }] as never), [{ id: "a" }]);
  // A single message is not a collection, so this is not how one is read.
  assert.deepEqual(unwrap({ id: "a" } as never), []);
});

check("a missing or empty collection is an empty list, never undefined", () => {
  assert.deepEqual(unwrap(undefined as never), []);
  assert.deepEqual(unwrap({ "hydra:totalItems": 0 } as never), []);
});

check("paging walks every page and stops on a short one", async () => {
  // 30 per page is what the API returns. A full page means there may be more; a
  // short one means stop, which is cheaper than trusting totalItems.
  const full = Array.from({ length: 30 }, (_, index) => ({ id: String(index) }));
  const second = [{ id: "30" }];

  let calls = 0;
  const pages: Record<number, unknown> = { 1: { "hydra:member": full }, 2: { "hydra:member": second } };
  const all = unwrapAll(async (page: number) => {
    calls++;
    return pages[page] as never;
  });

  const items = await all;
  assert.equal(items.length, 31);
  assert.equal(calls, 2);
});

check("a single page is fetched once and no more", async () => {
  let calls = 0;
  const items = await unwrapAll(async () => {
    calls++;
    return COLLECTION as never;
  });
  assert.equal(items.length, 2);
  assert.equal(calls, 1);
});

check("paging stops rather than looping on an API that keeps returning 30", async () => {
  // The upstream recurses until the page arithmetic happens to line up. A server
  // that never runs out would loop forever; a hard cap stops it.
  let calls = 0;
  const full = Array.from({ length: 30 }, (_, index) => ({ id: String(index) }));

  const items = await unwrapAll(async () => {
    calls++;
    return { "hydra:member": full } as never;
  });
  assert.ok(items.length <= 300, `fetched ${items.length} items`);
  assert.ok(calls <= 11, `made ${calls} calls`);
});

check("a rate-limited answer says so instead of looking empty", () => {
  // The API allows 30 requests a minute, measured from its ratelimit-policy
  // header. Silently returning nothing here would look like a quiet inbox.
  const error = apiError(429, "");
  assert.match(error.message, /busy|rate|wait/i);
  assert.equal(error.kind, "rate");
});

check("an expired token is told apart from a broken one", () => {
  assert.equal(apiError(401, "").kind, "token");
  assert.equal(apiError(403, "").kind, "token");
});

check("a taken username is recognised from the validation answer", () => {
  // 422 is what the API returns when the address is already registered.
  assert.equal(apiError(422, "address: The address is already taken").kind, "taken");
  // But 422 also covers an invalid domain, which is not the user's fault.
  assert.notEqual(apiError(422, "address: The domain is not valid").kind, "taken");
});

check("a network failure and a server failure read differently", () => {
  assert.equal(apiError(0, "fetch failed").kind, "network");
  assert.equal(apiError(500, "").kind, "server");
  assert.equal(apiError(404, "").kind, "server");
  assert.match(apiError(500, "").message, /mail\.tm/);
});

check("usernames the API accepts are not rejected locally", () => {
  // The form's placeholder says "no-spaces", so `-` and `.` have to work: both
  // were registered against the live API while this was being written.
  assert.equal(isAddressSafe("no-spaces"), true);
  assert.equal(isAddressSafe("a.b"), true);
  assert.equal(isAddressSafe("a_b"), true);
  assert.equal(isAddressSafe("vicinae2026"), true);

  assert.equal(isAddressSafe("-leading"), false);
  assert.equal(isAddressSafe("trailing-"), false);
  assert.equal(isAddressSafe("ab"), false, "too short to be a mailbox name");
  assert.equal(isAddressSafe("a".repeat(31)), false);
  assert.equal(isAddressSafe("has space"), false);
  assert.equal(isAddressSafe("Upper"), false, "the address is lowercased before this runs");
});

check("random usernames are address-safe and varied", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 200; index++) {
    const name = randomUsername();
    assert.match(name, /^[a-z0-9]{8,20}$/, `"${name}" is not safe in an address`);
    seen.add(name);
  }
  assert.equal(seen.size, 200, "every generated username collided");
});

Promise.all(pending).then(() => console.log(`\nall ${checks} checks passed`));
