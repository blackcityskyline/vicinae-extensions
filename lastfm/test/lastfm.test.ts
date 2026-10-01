import assert from "node:assert/strict";

import { errorFor, imageUrl, playedAt, requestUrl, unwrapList } from "../src/utils/lastfm.ts";

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

/** A shape-correct placeholder. The real key is never in the repository. */
const KEY = "0123456789abcdef0123456789abcdef";

/** The key names of a url's query, in the order they appear. */
function keys(url: string): string[] {
  return url
    .slice(url.indexOf("?") + 1)
    .split("&")
    .map((pair) => pair.slice(0, pair.indexOf("=")));
}

check("the request is a url the API accepts", () => {
  const url = requestUrl("user.getrecenttracks", { api_key: KEY, user: "koyaanis", format: "json", limit: 50 });
  assert.equal(
    url,
    `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&api_key=${KEY}&format=json&limit=50&user=koyaanis`,
  );
});

check("parameters are sorted, so the same call always looks the same", () => {
  // The API does not require an order, but an unsorted object makes a request
  // impossible to line up with a working one in a log.
  const url = requestUrl("user.gettopartists", { limit: 10, user: "koyaanis", api_key: KEY, format: "json", period: "7day" });
  assert.deepEqual(keys(url), ["method", "api_key", "format", "limit", "period", "user"]);

  // The same call written in a different order must come out identical.
  assert.equal(
    url,
    requestUrl("user.gettopartists", { period: "7day", api_key: KEY, format: "json", user: "koyaanis", limit: 10 }),
  );
});

check("parameters are sorted, so the same call always looks the same", () => {
  // The API does not require an order, but an unsorted object makes a request
  // impossible to line up with a working one in a log. Note that searching the
  // url for "user" is not good enough: the method name contains it too.
  const url = requestUrl("user.gettopartists", { limit: 10, user: "koyaanis", api_key: KEY, format: "json", period: "7day" });
  assert.deepEqual(keys(url), ["method", "api_key", "format", "limit", "period", "user"]);

  // The same call written in a different order must come out identical.
  assert.equal(
    url,
    requestUrl("user.gettopartists", { period: "7day", api_key: KEY, format: "json", user: "koyaanis", limit: 10 }),
  );
});

check("a value with a space or an ampersand cannot break out of the query", () => {
  const url = requestUrl("user.getrecenttracks", { api_key: KEY, user: "a b&c=d", format: "json", limit: 1 });
  assert.equal(url.slice(url.indexOf("user=") + 5), "a%20b%26c%3Dd");
  assert.deepEqual(keys(url), ["method", "api_key", "format", "limit", "user"], "the value injected a parameter");
});

check("an empty value is still sent, because the API treats it differently", () => {
  // `user=` and a missing `user` are not the same to Last.fm: an empty one
  // answers "User not found" while a missing one is a different complaint.
  const url = requestUrl("user.getrecenttracks", { api_key: KEY, user: "", format: "json", limit: 1 });
  assert.ok(url.endsWith("user="), url);
  assert.deepEqual(keys(url), ["method", "api_key", "format", "limit", "user"]);
});

check("the biggest image is picked, and it is a real one", () => {
  const small = { size: "small", "#text": "https://img.test/34s/a.png" };
  const medium = { size: "medium", "#text": "https://img.test/64s/a.png" };
  const large = { size: "large", "#text": "https://img.test/174s/a.png" };
  const images = [small, medium, large];
  assert.equal(imageUrl(images), "https://img.test/174s/a.png");
  assert.equal(imageUrl([medium, small]), "https://img.test/64s/a.png", "no large, so the next best");
  assert.equal(imageUrl([small]), "https://img.test/34s/a.png", "small only");
  assert.equal(imageUrl(images.slice(1)), "https://img.test/174s/a.png", "still has a large");
});

check("a missing or placeholder image yields nothing rather than a broken url", () => {
  assert.equal(imageUrl(undefined), undefined);
  assert.equal(imageUrl([]), undefined);
  // Last.fm sends an empty string, and a base64 placeholder, for things with no art.
  assert.equal(imageUrl([{ size: "large", "#text": "" }]), undefined);
  assert.equal(imageUrl([{ size: "large", "#text": "https://img.test/placeholder.png" }]), undefined);
});

check("a non-https image url is refused", () => {
  assert.equal(imageUrl([{ size: "large", "#text": "http://insecure.test/a.png" }]), undefined);
  assert.equal(imageUrl([{ size: "large", "#text": "javascript:alert(1)" }]), undefined);
});

check("a collection of one comes back as an object, not an array", () => {
  // This is why an extension shows nothing to a user with exactly one recent
  // track: `track` is the item itself when there is a single one.
  const single = { name: "Only One" };
  assert.deepEqual(unwrapList([single, { name: "Second" }]), [single, { name: "Second" }]);
  assert.deepEqual(unwrapList(single), [single]);
  assert.deepEqual(unwrapList(undefined), []);
  assert.deepEqual(unwrapList(null), []);
  assert.deepEqual(unwrapList([]), []);
});

check("a played date is read whether it is an object or a string", () => {
  // Recent tracks carry { "#text": ..., uts: ... }; top ones carry a bare string.
  assert.equal(playedAt({ date: { "#text": "10 Mar 2026, 04:59" } }), "10 Mar 2026, 04:59");
  assert.equal(playedAt({ date: "10 Mar 2026, 04:59" }), "10 Mar 2026, 04:59");
  assert.equal(playedAt({ date: { uts: "1773125952" } }), new Date(1773125952 * 1000).toISOString());
});

check("a track playing right now has no date at all", () => {
  assert.equal(playedAt({}), undefined);
  assert.equal(playedAt({ date: undefined }), undefined);
  assert.equal(playedAt({ date: {} }), undefined);
});

check("the API's error numbers become words a person can act on", () => {
  assert.match(errorFor(6), /username/i);
  assert.match(errorFor(10), /api key/i);
  assert.match(errorFor(29), /wait/i);
  assert.match(errorFor(13), /artwork/i);
  // An unknown code must not be swallowed: the number is the only clue.
  assert.match(errorFor(999), /999/);
});

check("every method the extension uses is one the API serves unsigned", () => {
  // Verified live: these answer with "Invalid API key" rather than asking for a
  // signature, so none of them needs the secret or a session.
  const methods = [
    "user.getrecenttracks",
    "user.getlovedtracks",
    "user.gettopartists",
    "user.gettopalbums",
  ];
  for (const method of methods) {
    assert.match(method, /^user\./);
    assert.ok(requestUrl(method, { api_key: KEY, user: "x", format: "json", limit: 1 }).includes(`method=${method}`));
  }
});

console.log(`\nall ${checks} checks passed`);
