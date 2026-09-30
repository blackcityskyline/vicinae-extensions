import type { Owner, Repository } from "../api/github.ts";

/**
 * The custom repository list.
 *
 * `LocalStorage.setItem` only accepts a string, number or boolean, so the list
 * travels as a JSON string. That makes the stored value something this extension
 * did not produce and cannot trust, so parsing is defensive: a corrupt entry is
 * dropped rather than crashing a list render.
 *
 * The list stores the repository payload, not just its name, so opening the list
 * needs no network at all. The cost is that a stored row's star count and "last
 * push" go stale; re-adding a repository from Search Repositories refreshes it.
 *
 * Pure, so `test/parsing.test.ts` can check it headlessly.
 */

/** A working list is a short one. Past this it is a search, not a list. */
export const CUSTOM_LIST_LIMIT = 200;

const REPOSITORY_NAME = /^[^/\s]+\/[^/\s]+$/;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function owner(value: unknown): Owner {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const login = str(raw.login);
  return { login, avatar_url: str(raw.avatar_url), html_url: str(raw.html_url) };
}

/**
 * Build a complete `Repository` from an untrusted value, or reject it.
 *
 * Only the fields a row actually reads are required. The rest get explicit
 * defaults so the stored shape can stay small without the list having to know
 * which fields a row happens to use this month.
 */
export function toRepository(value: unknown): Repository | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const fullName = str(raw.full_name);
  if (!REPOSITORY_NAME.test(fullName)) return null;

  const name = str(raw.name) || (fullName.split("/")[1] ?? fullName);
  const htmlUrl = str(raw.html_url);
  const ownerValue = owner(raw.owner);
  if (htmlUrl === "" || ownerValue.login === "") return null;

  return {
    id: num(raw.id),
    name,
    full_name: fullName,
    description: str(raw.description) || null,
    html_url: htmlUrl,
    owner: ownerValue,
    stargazers_count: num(raw.stargazers_count),
    forks_count: num(raw.forks_count),
    open_issues_count: num(raw.open_issues_count),
    language: str(raw.language) || null,
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t): t is string => typeof t === "string") : [],
    archived: bool(raw.archived),
    fork: bool(raw.fork),
    private: bool(raw.private),
    default_branch: str(raw.default_branch, "main"),
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
    pushed_at: str(raw.pushed_at),
  };
}

export function parseCustomList(raw: string | undefined | null): Repository[] {
  if (raw === undefined || raw === null || raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  // A JSON object parses fine, so the array check has to be explicit.
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const list: Repository[] = [];
  for (const entry of parsed) {
    const repository = toRepository(entry);
    if (repository === null) continue;

    const key = repository.full_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(repository);
    if (list.length >= CUSTOM_LIST_LIMIT) break;
  }

  return list;
}

export function serializeCustomList(list: readonly Repository[]): string {
  return JSON.stringify(list.slice(0, CUSTOM_LIST_LIMIT));
}

export function isInCustomList(list: readonly Repository[], fullName: string): boolean {
  return list.some((entry) => entry.full_name.toLowerCase() === fullName.toLowerCase());
}

/** Add `repository` at the front, or remove it if already present. */
export function toggleInCustomList(list: readonly Repository[], repository: Repository): Repository[] {
  if (isInCustomList(list, repository.full_name)) {
    return list.filter((entry) => entry.full_name.toLowerCase() !== repository.full_name.toLowerCase());
  }

  return [repository, ...list].slice(0, CUSTOM_LIST_LIMIT);
}
