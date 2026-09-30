import assert from "node:assert/strict";

import type { Repository } from "../src/api/github.ts";
import {
  CUSTOM_LIST_LIMIT,
  isInCustomList,
  parseCustomList,
  serializeCustomList,
  toggleInCustomList,
} from "../src/utils/custom-list.ts";
import { decodeReadme, MAX_README_CHARS, truncateReadme } from "../src/utils/readme.ts";

/** A minimal complete repository payload, as the row renders it. */
function repo(fullName: string, id: number): Repository {
  const [owner = "", name = ""] = fullName.split("/");
  return {
    id,
    name,
    full_name: fullName,
    description: `${name} description`,
    html_url: `https://github.com/${fullName}`,
    owner: { login: owner, avatar_url: "", html_url: `https://github.com/${owner}` },
    stargazers_count: id,
    forks_count: 0,
    open_issues_count: 0,
    language: "Rust",
    topics: [],
    archived: false,
    fork: false,
    private: false,
    default_branch: "main",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    pushed_at: "2024-01-01T00:00:00Z",
  };
}

/**
 * Self-check for the two parsers of data this extension did not produce: the
 * custom list, which round-trips through `LocalStorage` as a JSON string, and
 * the README, which arrives base64-encoded inside a JSON payload.
 *
 * Both are reachable with hand-edited or corrupted values, so both must
 * degrade to something usable rather than throw inside a list render.
 */

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

// --- custom list ------------------------------------------------------------

check("an absent or empty list is empty, not an error", () => {
  assert.deepEqual(parseCustomList(undefined), []);
  assert.deepEqual(parseCustomList(""), []);
  assert.deepEqual(parseCustomList("   "), []);
});

check("a well-formed list round-trips", () => {
  const list = [repo("acme/widget", 1), repo("torvalds/linux", 2)];
  assert.deepEqual(parseCustomList(serializeCustomList(list)), list);
  assert.deepEqual(parseCustomList(serializeCustomList([])), []);
});

check("corrupt JSON degrades to empty instead of throwing", () => {
  // A render must not die because a stored value went bad.
  for (const bad of ["{", "null", "undefined", "not json at all", "[", '"a string"', "42"]) {
    assert.deepEqual(parseCustomList(bad), [], `input: ${bad}`);
  }
});

check("entries missing the fields a row needs are dropped", () => {
  const stored = JSON.stringify([
    repo("acme/widget", 1),
    { full_name: "no/html-url", owner: { login: "acme" } },
    { full_name: "no/owner" },
    { full_name: "not-a-slug" },
    { full_name: "a/b/c" },
    "a string",
    42,
    null,
  ]);
  const list = parseCustomList(stored);
  assert.deepEqual(list.map((r) => r.full_name), ["acme/widget"], "only the complete entry survives");
});

check("a JSON object is not mistaken for a list", () => {
  assert.deepEqual(parseCustomList('{"acme/widget": true}'), []);
});

check("missing optional fields get safe defaults, not undefined", () => {
  const [only] = parseCustomList(JSON.stringify([{ full_name: "a/b", html_url: "https://x/a/b", owner: { login: "a" } }]));
  assert.ok(only);
  assert.equal(only.name, "b", "name is derived from full_name");
  assert.equal(only.description, null);
  assert.equal(only.language, null);
  assert.deepEqual(only.topics, []);
  assert.equal(only.stargazers_count, 0);
  assert.equal(only.archived, false);
  assert.equal(only.default_branch, "main");
  assert.equal(only.owner.avatar_url, "");
});

check("a wrong-typed field falls back instead of propagating", () => {
  const [entry] = parseCustomList(
    JSON.stringify([{ ...repo("a/b", 1), stargazers_count: "many", topics: "nope", archived: "yes" }]),
  );
  assert.ok(entry);
  assert.equal(entry.stargazers_count, 0);
  assert.deepEqual(entry.topics, []);
  assert.equal(entry.archived, false);
});

check("topics keep only their strings", () => {
  const [entry] = parseCustomList(JSON.stringify([{ ...repo("a/b", 1), topics: ["cli", 7, null, "parser"] }]));
  assert.deepEqual(entry?.topics, ["cli", "parser"]);
});

check("toggling adds then removes", () => {
  const widget = repo("acme/widget", 1);
  let list: Repository[] = [];
  list = toggleInCustomList(list, widget);
  assert.deepEqual(list.map((r) => r.full_name), ["acme/widget"]);
  assert.equal(isInCustomList(list, "acme/widget"), true);

  list = toggleInCustomList(list, widget);
  assert.deepEqual(list, []);
  assert.equal(isInCustomList(list, "acme/widget"), false);
});

check("newest entries come first", () => {
  const list = toggleInCustomList(toggleInCustomList([], repo("a/one", 1)), repo("b/two", 2));
  assert.deepEqual(list.map((r) => r.full_name), ["b/two", "a/one"]);
});

check("membership is case-insensitive, since GitHub owners are", () => {
  const list = parseCustomList(JSON.stringify([repo("Acme/Widget", 1)]));
  assert.equal(isInCustomList(list, "acme/widget"), true);
  assert.equal(isInCustomList(list, "ACME/WIDGET"), true);
});

check("toggling an existing entry is case-insensitive and drops the duplicate", () => {
  const list = parseCustomList(JSON.stringify([repo("Acme/Widget", 1)]));
  assert.deepEqual(toggleInCustomList(list, repo("acme/widget", 9)), []);
});

check("the list is capped so it cannot grow without bound", () => {
  let list: Repository[] = [];
  for (let i = 0; i < CUSTOM_LIST_LIMIT + 25; i += 1) list = toggleInCustomList(list, repo(`owner/repo-${i}`, i));
  assert.equal(list.length, CUSTOM_LIST_LIMIT, `got ${list.length}`);
});

check("a stored list longer than the cap is trimmed on read", () => {
  const oversized = JSON.stringify(
    Array.from({ length: CUSTOM_LIST_LIMIT + 50 }, (_, i) => repo(`o/r${i}`, i)),
  );
  assert.equal(parseCustomList(oversized).length, CUSTOM_LIST_LIMIT);
});

check("duplicate entries in storage collapse to one", () => {
  const stored = JSON.stringify([repo("acme/widget", 1), repo("Acme/Widget", 2), repo("acme/widget", 3)]);
  assert.equal(parseCustomList(stored).length, 1);
});

// --- readme -----------------------------------------------------------------

check("base64 with embedded newlines decodes, as GitHub sends it", () => {
  // GitHub wraps the base64 payload across lines; Buffer.from ignores the
  // whitespace, but a naive decoder would corrupt it.
  const source = "# Title\n\nSome **markdown** body with a ünïcödé char.";
  const wrapped = Buffer.from(source, "utf8").toString("base64").replace(/(.{20})/g, "$1\n");
  assert.equal(decodeReadme(wrapped, "base64"), source);
});

check("an oversized readme is truncated with a visible notice", () => {
  const huge = "x".repeat(MAX_README_CHARS + 5000);
  const { markdown, truncated } = truncateReadme(huge);
  assert.equal(truncated, true);
  assert.ok(markdown.length < huge.length, "must be shorter than the input");
  assert.match(markdown, /truncated/i, "the reader must be told it is cut off");
});

check("a readme under the limit is left alone", () => {
  const small = "# Hi\n\nbody";
  const { markdown, truncated } = truncateReadme(small);
  assert.equal(markdown, small);
  assert.equal(truncated, false);
});

check("a readme exactly at the limit is not truncated", () => {
  const exact = "y".repeat(MAX_README_CHARS);
  assert.equal(truncateReadme(exact).truncated, false);
});

check("base64 that is not valid decodes to something, never a throw", () => {
  assert.equal(typeof decodeReadme("!!!not base64!!!", "base64"), "string");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
