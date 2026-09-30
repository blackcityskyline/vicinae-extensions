/**
 * GitHub search query construction.
 *
 * Pure functions, no I/O, so they can be checked without a token or a network.
 * See `test/search-query.test.ts` for the regression this exists to prevent.
 */

export const REPO_SORTS = [
  { title: "Best Match", value: "relevance", qualifier: "" },
  { title: "Last Updated", value: "updated", qualifier: "sort:updated" },
  { title: "Most Stars", value: "stars", qualifier: "sort:stars" },
  { title: "Most Forks", value: "forks", qualifier: "sort:forks" },
] as const;

export type RepoSort = (typeof REPO_SORTS)[number]["value"];

export const ISSUE_PRESETS = [
  { title: "All", value: "all", qualifier: "" },
  { title: "Created by Me", value: "authored", qualifier: "author:@me" },
  { title: "Assigned to Me", value: "assigned", qualifier: "assignee:@me" },
  { title: "Mentioning Me", value: "mentioning", qualifier: "mentions:@me" },
] as const;

export type IssuePreset = (typeof ISSUE_PRESETS)[number]["value"];

export const PULL_REQUEST_PRESETS = [
  { title: "All", value: "all", qualifier: "" },
  { title: "Review Requested", value: "review-requested", qualifier: "review-requested:@me" },
  { title: "Created by Me", value: "authored", qualifier: "author:@me" },
  { title: "Assigned to Me", value: "assigned", qualifier: "assignee:@me" },
  { title: "Mentioning Me", value: "mentioning", qualifier: "mentions:@me" },
] as const;

export type PullRequestPreset = (typeof PULL_REQUEST_PRESETS)[number]["value"];

export type StateFilter = "open" | "closed" | "all";

/** Collapse runs of whitespace, so pasted text cannot produce empty tokens. */
function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasQualifier(text: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}:`, "i").test(text);
}

export type RepositoryQueryOptions = {
  text: string;
  /** `user:`/`org:` qualifiers, or null/empty when the scope is unrestricted. */
  ownerFilter?: string | null;
  sort?: RepoSort;
  includeForks: boolean;
  includeArchived: boolean;
};

/**
 * Build a repository search query.
 *
 * Every segment goes through `normalize` and empty segments are dropped, so a
 * `null` or `undefined` value can never reach the query string. The Raycast
 * extension interpolated those values directly, which put a literal "null"
 * token into the query and silently emptied the result set.
 *
 * The user's own text is passed through untouched apart from whitespace
 * collapsing, so qualifiers like `in:readme` or `stars:>1000` keep working.
 */
export function buildRepositoryQuery(options: RepositoryQueryOptions): string {
  const text = normalize(options.text);
  const ownerFilter = normalize(options.ownerFilter);

  // With neither free text nor an owner scope the query would degrade to
  // "fork:true", which asks GitHub for every repository that exists. Returning
  // an empty string lets the caller skip the request until something is typed.
  if (text === "" && ownerFilter === "") return "";

  const sort = REPO_SORTS.find((candidate) => candidate.value === options.sort) ?? REPO_SORTS[0];

  return [
    text,
    ownerFilter,
    // A sort typed by the user wins; adding ours too would contradict it.
    hasQualifier(text, "sort") ? "" : sort.qualifier,
    `fork:${options.includeForks}`,
    options.includeArchived ? "" : "archived:false",
  ]
    .filter((token) => token !== "")
    .join(" ");
}

type ScopedQueryOptions = {
  text: string;
  preset: string;
  state?: StateFilter;
};

function buildScopedQuery(kind: "issue" | "pr", options: ScopedQueryOptions, presets: readonly { value: string; qualifier: string }[]) {
  const text = normalize(options.text);
  const preset = presets.find((candidate) => candidate.value === options.preset) ?? presets[0];
  const state = options.state && options.state !== "all" ? `state:${options.state}` : "";

  return [`is:${kind}`, text, preset?.qualifier ?? "", state].filter((token) => token !== "").join(" ");
}

export function buildIssueQuery(options: ScopedQueryOptions): string {
  return buildScopedQuery("issue", options, ISSUE_PRESETS);
}

export function buildPullRequestQuery(options: ScopedQueryOptions): string {
  return buildScopedQuery("pr", options, PULL_REQUEST_PRESETS);
}

/** GitHub's search API accepts 1..100 per page. Anything else falls back to 50. */
export function parseResultCount(raw: string | null | undefined): number {
  const text = normalize(raw);
  // Number("") is 0, not NaN, so an empty preference would silently clamp to
  // the floor instead of falling back to the default.
  if (text === "") return 50;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 10), 100);
}

export type RepositoryKeywordSource = {
  nameWithOwner: string;
  description: string | null;
  primaryLanguage: string | null;
  topics?: readonly string[] | null;
};

/**
 * Extra search terms for a repository row.
 *
 * The row only shows `owner/name`, so without this the description, language
 * and topics would be invisible to the builtin fuzzy filter. Keywords rank
 * below the title, so adding them cannot displace a title match.
 */
export function repositoryKeywords(repository: RepositoryKeywordSource): string[] {
  const fullName = normalize(repository.nameWithOwner);
  const [owner = "", name = ""] = fullName.split("/");

  return [fullName, owner, name, normalize(repository.description), normalize(repository.primaryLanguage), ...(repository.topics ?? [])]
    .map((keyword) => keyword.toLowerCase())
    .filter((keyword) => keyword !== "")
    .filter((keyword, index, all) => all.indexOf(keyword) === index);
}
