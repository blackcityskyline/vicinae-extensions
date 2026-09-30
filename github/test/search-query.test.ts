import assert from "node:assert/strict";

import {
  buildIssueQuery,
  buildPullRequestQuery,
  buildRepositoryQuery,
  parseResultCount,
  repositoryKeywords,
  REPO_SORTS,
  type RepoSort,
} from "../src/api/search-query.ts";

/**
 * Self-check for the GitHub search query builder.
 *
 * This is a regression test. The Raycast extension built its query with a
 * template literal over values that were `null` before the user touched the
 * filter dropdown, so the literal token "null" was sent to GitHub and ANDed
 * with the search text. Measured against the live API: "vicinae" returns 261
 * repositories, "null vicinae" returns 0. The search looked merely incomplete
 * because it only broke on the paths where the dropdown had not fired.
 *
 * No test runner in Vicinae: this is a plain script, `npm test` runs it with
 * tsx and a non-zero exit fails.
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

const BASE = { includeForks: true, includeArchived: true } as const;

// --- the regression ---------------------------------------------------------

check("a null owner filter emits no token at all", () => {
  const query = buildRepositoryQuery({ ...BASE, text: "vicinae", ownerFilter: null });
  assert.equal(query, "vicinae fork:true");
  assert.ok(!query.includes("null"), "query must never contain the token 'null'");
  assert.ok(!query.includes("undefined"), "query must never contain 'undefined'");
});

check("an empty or whitespace owner filter emits no token", () => {
  assert.equal(buildRepositoryQuery({ ...BASE, text: "vicinae", ownerFilter: "" }), "vicinae fork:true");
  assert.equal(buildRepositoryQuery({ ...BASE, text: "vicinae", ownerFilter: "   " }), "vicinae fork:true");
});

check("no query segment is ever left with stray whitespace", () => {
  const query = buildRepositoryQuery({
    ...BASE,
    text: "  hello   world  ",
    ownerFilter: " user:octocat ",
    sort: "stars",
  });
  assert.equal(query.includes("  "), false, `double space in: ${query}`);
  assert.equal(query.startsWith(" "), false);
  assert.equal(query.endsWith(" "), false);
});

// --- owner scoping ----------------------------------------------------------

check("owner qualifiers are preserved and ANDed with the text", () => {
  const query = buildRepositoryQuery({ ...BASE, text: "cli", ownerFilter: "user:octocat org:acme" });
  assert.equal(query, "cli user:octocat org:acme fork:true");
});

check("owner-only search still queries, with no free text", () => {
  const query = buildRepositoryQuery({ ...BASE, text: "", ownerFilter: "org:acme" });
  assert.equal(query, "org:acme fork:true");
});

check("an empty search produces no query at all", () => {
  // Otherwise the query degrades to "fork:true", which asks GitHub for every
  // repository that exists, on the very first render of the command.
  assert.equal(buildRepositoryQuery({ ...BASE, text: "", sort: "stars" }), "");
  assert.equal(buildRepositoryQuery({ ...BASE, text: "   " }), "");
  assert.equal(buildRepositoryQuery({ ...BASE, text: "", ownerFilter: null, sort: "forks" }), "");
});

// --- flags ------------------------------------------------------------------

check("archived repositories are excluded only when asked", () => {
  const excluded = buildRepositoryQuery({ ...BASE, text: "vicinae", includeArchived: false });
  assert.equal(excluded, "vicinae fork:true archived:false");

  const included = buildRepositoryQuery({ ...BASE, text: "vicinae", includeArchived: true });
  assert.ok(!included.includes("archived"), `unexpected archived filter: ${included}`);
});

check("forks are excluded only when asked", () => {
  const excluded = buildRepositoryQuery({ ...BASE, text: "vicinae", includeForks: false });
  assert.equal(excluded, "vicinae fork:false");
});

// --- sort -------------------------------------------------------------------

check("relevance adds no sort token", () => {
  assert.equal(buildRepositoryQuery({ ...BASE, text: "vicinae", sort: "relevance" }), "vicinae fork:true");
});

check("every advertised sort produces a distinct qualifier", () => {
  // Relevance is the one sort expressed by emitting nothing, so it is excluded
  // here and asserted separately.
  const seen = new Map<string, RepoSort>();
  for (const { value } of REPO_SORTS.filter((sort) => sort.qualifier !== "")) {
    const query = buildRepositoryQuery({ ...BASE, text: "vicinae", sort: value });
    const tokens = query.split(" ").filter((token) => token.startsWith("sort:"));
    assert.equal(tokens.length, 1, `expected one sort token, got ${tokens.length} in ${query}`);
    const token = tokens[0] as string;
    assert.equal(seen.has(token), false, `duplicate sort qualifier ${token}`);
    seen.set(token, value);
  }
  assert.equal(seen.size, REPO_SORTS.length - 1);
});

check("sorts only use qualifiers GitHub accepts for repositories", () => {
  // Repository search accepts stars, forks, help-wanted-issues and updated.
  // "sort:name" is rejected, so it must not be reachable from the manifest.
  // Relevance is expressed by omitting the sort token entirely.
  const allowed = new Set(["stars", "forks", "updated", "help-wanted-issues"]);
  const qualified = REPO_SORTS.filter(({ qualifier }) => qualifier !== "");
  for (const { value, qualifier } of qualified) {
    const name = qualifier.split(":")[1] as string;
    assert.ok(allowed.has(name), `unsupported sort qualifier ${qualifier} for ${value}`);
  }
  assert.equal(REPO_SORTS.length - qualified.length, 1, "exactly one sort must omit the qualifier");
  assert.equal(REPO_SORTS.find(({ qualifier }) => qualifier === "")?.value, "relevance");
});

// --- user text is passed through, not mangled -------------------------------

check("in: qualifiers typed by the user survive", () => {
  // Measured: "kubernetes in:name,description" -> 248589 results but
  // "kubernetes in:readme" -> 1162546. The README index is 4.7x wider, so
  // swallowing this qualifier is what makes results look incomplete.
  const query = buildRepositoryQuery({ ...BASE, text: "kubernetes in:readme" });
  assert.equal(query, "kubernetes in:readme fork:true");
});

check("qualifier-only text is a valid query", () => {
  const query = buildRepositoryQuery({ ...BASE, text: "stars:>1000" });
  assert.equal(query, "stars:>1000 fork:true");
});

check("quoted phrases are preserved as one unit", () => {
  const query = buildRepositoryQuery({ ...BASE, text: '"machine learning"  torch' });
  assert.equal(query, '"machine learning" torch fork:true');
});

check("sort: typed by the user is not duplicated by our own sort", () => {
  const query = buildRepositoryQuery({ ...BASE, text: "vicinae sort:stars", sort: "forks" });
  assert.equal(query.split(" ").filter((t) => t.startsWith("sort:")).length, 1, query);
});

// --- issues and pull requests ----------------------------------------------

check("issue presets produce a scoped query", () => {
  assert.equal(buildIssueQuery({ text: "crash", preset: "authored" }), "is:issue crash author:@me");
  assert.equal(buildIssueQuery({ text: "crash", preset: "assigned" }), "is:issue crash assignee:@me");
  assert.equal(buildIssueQuery({ text: "crash", preset: "mentioning" }), "is:issue crash mentions:@me");
  assert.equal(buildIssueQuery({ text: "crash", preset: "all" }), "is:issue crash");
});

check("an open-state filter is only added when selected", () => {
  assert.equal(buildIssueQuery({ text: "crash", preset: "all", state: "open" }), "is:issue crash state:open");
  assert.equal(buildIssueQuery({ text: "crash", preset: "all", state: "closed" }), "is:issue crash state:closed");
  assert.equal(buildIssueQuery({ text: "crash", preset: "all", state: "all" }), "is:issue crash");
});

check("pull request queries never collide with issue queries", () => {
  const pr = buildPullRequestQuery({ text: "fix", preset: "review-requested" });
  assert.equal(pr, "is:pr fix review-requested:@me");
  assert.ok(!buildIssueQuery({ text: "fix", preset: "authored" }).includes("is:pr"));
});

check("empty issue input still yields a scannable query", () => {
  assert.equal(buildIssueQuery({ text: "", preset: "authored" }), "is:issue author:@me");
});

// --- page size --------------------------------------------------------------

check("page size is clamped to what GitHub accepts", () => {
  assert.equal(parseResultCount("100"), 100);
  assert.equal(parseResultCount("1"), 10, "below the floor");
  assert.equal(parseResultCount("1000"), 100, "above the ceiling");
  assert.equal(parseResultCount(""), 50, "empty falls back");
  assert.equal(parseResultCount("abc"), 50, "garbage falls back");
  assert.equal(parseResultCount("  42  "), 42, "trims");
});

// --- local fuzzy keywords ---------------------------------------------------

check("keywords carry every field the builtin filter should match", () => {
  // The repository title only shows owner/name, so description, language and
  // topics would otherwise be unsearchable.
  const keywords = repositoryKeywords({
    nameWithOwner: "acme/widget",
    description: "A fast widget parser",
    primaryLanguage: "Rust",
    topics: ["cli", "parser"],
  });
  const joined = keywords.join(" ").toLowerCase();
  for (const expected of ["acme/widget", "acme", "widget", "fast widget parser", "rust", "cli", "parser"]) {
    assert.ok(joined.includes(expected), `missing "${expected}" in ${joined}`);
  }
});

check("keywords tolerate absent fields", () => {
  const keywords = repositoryKeywords({
    nameWithOwner: "acme/widget",
    description: null,
    primaryLanguage: null,
    topics: [],
  });
  assert.deepEqual(keywords, ["acme/widget", "acme", "widget"]);
});

check("keywords split the owner and the name so both match alone", () => {
  const keywords = repositoryKeywords({ nameWithOwner: "facebook/react", description: null, primaryLanguage: null, topics: [] });
  assert.ok(keywords.includes("facebook"), "owner must match on its own");
  assert.ok(keywords.includes("react"), "name must match on its own");
});

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
