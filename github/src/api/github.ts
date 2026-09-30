import { getPreferenceValues } from "@vicinae/api";

import { apiRequest, GitHubError, queryString } from "./client.ts";
import { parseResultCount } from "./search-query.ts";

/**
 * The subset of GitHub's REST payloads this extension renders.
 *
 * These are hand-written rather than generated: the upstream extension carried
 * a 74k-line GraphQL schema and 42k lines of codegen output to produce the same
 * shapes over a different transport.
 */

export type Owner = { login: string; avatar_url: string; html_url: string };

export type Repository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  owner: Owner;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  archived: boolean;
  fork: boolean;
  private: boolean;
  default_branch: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
};

export type Label = { name: string; color: string };

export type Issue = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  /** `https://api.github.com/repos/acme/widget`; the search payload has no nested repo. */
  repository_url: string;
  state: "open" | "closed";
  user: Owner | null;
  labels: Label[];
  comments: number;
  created_at: string;
  updated_at: string;
};

export type PullRequest = Issue & {
  draft: boolean;
  head: { ref: string };
  base: { ref: string };
};

export type WorkflowRun = {
  id: number;
  name: string | null;
  run_number: number;
  event: string;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested";
  conclusion: string | null;
  html_url: string;
  head_branch: string;
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  subject: { title: string; type: string; url: string | null };
  repository: { full_name: string; owner: Owner };
};

export type Branch = { name: string; commit: { sha: string } };

type SearchResult<T> = { total_count: number; incomplete_results: boolean; items: T[] };
type Listed<T> = T[];

/** The configured page size, clamped to what GitHub accepts. */
export function resultsPerPage(): number {
  return parseResultCount(getPreferenceValues<Preferences>().numberOfResults);
}

// --- search -----------------------------------------------------------------

/**
 * Search repositories.
 *
 * Returns the page of results only. `useCachedPromise` requires a paginated
 * function to resolve to an array, so the response's `total_count` and
 * `incomplete_results` cannot ride along with the page.
 */
export function searchRepositories(query: string, page = 1): Promise<Repository[]> {
  return apiRequest<SearchResult<Repository>>(
    `/search/repositories${queryString({ q: query, per_page: resultsPerPage(), page })}`,
  ).then((result) => result.items);
}

export function searchIssues(query: string, page = 1): Promise<Issue[]> {
  return apiRequest<SearchResult<Issue>>(
    `/search/issues${queryString({
      q: query,
      per_page: resultsPerPage(),
      page,
      sort: "updated",
      order: "desc",
    })}`,
  ).then((result) => result.items);
}

/**
 * Search pull requests.
 *
 * `/search/issues` returns pull requests as well as issues; the `is:pr`
 * qualifier keeps the two apart, so nothing is filtered out client-side.
 */
export function searchPullRequests(query: string, page = 1): Promise<PullRequest[]> {
  return apiRequest<SearchResult<PullRequest>>(
    `/search/issues${queryString({
      q: query,
      per_page: resultsPerPage(),
      page,
      sort: "updated",
      order: "desc",
    })}`,
  ).then((result) => result.items);
}

// --- viewer and repositories ------------------------------------------------

export function listViewerRepositories(
  affiliation: "owner" | "collaborator" | "organization_member",
  sort: "created" | "updated" | "pushed",
  page = 1,
): Promise<Listed<Repository>> {
  return apiRequest<Listed<Repository>>(
    `/user/repos${queryString({ affiliation, sort, per_page: resultsPerPage(), page })}`,
  );
}

export function listStarredRepositories(page = 1): Promise<Listed<Repository>> {
  return apiRequest<Listed<Repository>>(
    `/user/starred${queryString({ sort: "created", direction: "desc", per_page: resultsPerPage(), page })}`,
  );
}

/**
 * Whether the viewer has starred a repository.
 *
 * `GET /user/starred/{owner}/{repo}` answers 204 when starred and 404 when not,
 * which is the only endpoint that answers the question without listing every
 * stargazer. Any other status is a real failure and is raised.
 */
export async function isStarred(owner: string, name: string): Promise<boolean> {
  try {
    await apiRequest<void>(`/user/starred/${owner}/${name}`);
    return true;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return false;
    throw error;
  }
}

/** Star or unstar. */
export function setStarred(owner: string, name: string, starred: boolean): Promise<void> {
  return apiRequest<void>(`/user/starred/${owner}/${name}`, { method: starred ? "PUT" : "DELETE" });
}

export function listBranches(owner: string, name: string): Promise<Listed<Branch>> {
  return apiRequest<Listed<Branch>>(`/repos/${owner}/${name}/branches${queryString({ per_page: 100 })}`);
}

// --- writes -----------------------------------------------------------------

/** Open or close an issue or pull request. */
export function setItemState(
  owner: string,
  name: string,
  number: number,
  state: "open" | "closed",
): Promise<Issue> {
  return apiRequest<Issue>(`/repos/${owner}/${name}/issues/${number}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

export function listLabels(owner: string, name: string): Promise<Listed<Label>> {
  return apiRequest<Listed<Label>>(`/repos/${owner}/${name}/labels${queryString({ per_page: 100 })}`);
}

export function listAssignees(owner: string, name: string): Promise<Listed<{ id: number; login: string; avatar_url: string }>> {
  return apiRequest(`/repos/${owner}/${name}/assignees${queryString({ per_page: 100 })}`);
}

export function createIssue(
  owner: string,
  name: string,
  body: { title: string; body?: string; labels?: string[]; assignees?: string[] },
): Promise<Issue> {
  return apiRequest<Issue>(`/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createPullRequest(
  owner: string,
  name: string,
  body: { title: string; body?: string; head: string; base: string; draft?: boolean },
): Promise<PullRequest> {
  return apiRequest<PullRequest>(`/repos/${owner}/${name}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createBranch(
  owner: string,
  name: string,
  body: { ref: string; sha: string },
): Promise<{ ref: string; object: { sha: string } }> {
  return apiRequest(`/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${body.ref}`, sha: body.sha }),
  });
}

// --- workflows --------------------------------------------------------------

export function listWorkflowRuns(
  owner: string,
  name: string,
  options: { branch?: string; page?: number } = {},
): Promise<{ total_count: number; workflow_runs: WorkflowRun[] }> {
  return apiRequest(`/repos/${owner}/${name}/actions/runs${queryString({
    branch: options.branch,
    per_page: resultsPerPage(),
    page: options.page ?? 1,
  })}`);
}

export function cancelWorkflowRun(owner: string, name: string, runId: number): Promise<void> {
  return apiRequest<void>(`/repos/${owner}/${name}/actions/runs/${runId}/cancel`, { method: "POST" });
}

export function rerunWorkflowRun(
  owner: string,
  name: string,
  runId: number,
  failedJobsOnly: boolean,
): Promise<void> {
  const path = failedJobsOnly ? "rerun-failed-jobs" : "rerun";
  return apiRequest<void>(`/repos/${owner}/${name}/actions/runs/${runId}/${path}`, { method: "POST" });
}

// --- notifications ----------------------------------------------------------

export function listNotifications(page = 1): Promise<Listed<Notification>> {
  return apiRequest<Listed<Notification>>(
    `/notifications${queryString({ per_page: resultsPerPage(), page })}`,
  );
}

export function markNotificationThreadRead(threadId: string): Promise<void> {
  return apiRequest<void>(`/notifications/threads/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read: true }),
  });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiRequest<void>("/notifications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ read: true, last_read_at: new Date().toISOString() }),
  });
}
