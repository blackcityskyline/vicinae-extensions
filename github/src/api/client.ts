import { getPreferenceValues } from "@vicinae/api";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

/**
 * A failure returned by GitHub, or a failure reaching GitHub.
 *
 * `status` is 0 when the request never completed, which is the only way to tell
 * "you are offline" apart from "GitHub said no".
 */
export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }

  /** Worth retrying: rate limited or GitHub-side. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

function readToken(): string {
  const { personalAccessToken } = getPreferenceValues<Preferences>();
  if (!personalAccessToken) {
    throw new GitHubError("Set a GitHub personal access token in the extension preferences.", 401);
  }
  return personalAccessToken;
}

type ErrorBody = { message?: string; errors?: { message?: string }[]; documentation_url?: string };

/**
 * Turn a GitHub failure into something worth showing a user.
 *
 * The raw message is kept only when it is not a well-known condition we can
 * explain better. Nothing here echoes the request, so the token cannot leak
 * into a toast or the log.
 */
function describeFailure(status: number, body: ErrorBody | null): string {
  switch (status) {
    case 401:
      return "GitHub rejected the personal access token. Check that it is current and not expired.";
    case 403:
      return body?.message?.includes("secondary rate limit")
        ? "GitHub is rate limiting this token. Wait a moment before searching again."
        : "GitHub refused the request. The token may be missing a required scope.";
    case 404:
      return "Not found. The repository, branch or run may have been renamed or deleted.";
    case 422: {
      const detail = body?.errors?.map((error) => error.message).filter(Boolean).join("; ");
      return detail ? `GitHub rejected the query: ${detail}` : "GitHub rejected the query as invalid.";
    }
    case 429:
      return "GitHub is rate limiting this token. Wait a moment before searching again.";
    default:
      return body?.message ?? `GitHub returned an unexpected status (${status}).`;
  }
}

async function toGitHubError(response: Response): Promise<GitHubError> {
  let body: ErrorBody | null = null;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // A non-JSON error body is not worth reporting; the status is enough.
  }

  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const minutes = Number.isFinite(reset) ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null;
    return new GitHubError(
      minutes
        ? `GitHub rate limit reached. Resets in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
        : "GitHub rate limit reached. It resets shortly.",
      403,
    );
  }

  return new GitHubError(describeFailure(response.status, body), response.status);
}

/**
 * Call the GitHub REST API.
 *
 * The global `fetch` is used rather than a client library: the endpoints needed
 * here are a thin wrapper over HTTP, and the upstream extension carried
 * `graphql-request`, `@octokit/rest` and `node-fetch` to do the same job.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${readToken()}`,
        "User-Agent": "vicinae-github-raycast",
        "X-GitHub-Api-Version": API_VERSION,
        ...init.headers,
      },
    });
  } catch (error) {
    // Logged because this is the failure that has no HTTP status to explain it,
    // and the toast it produces cannot say what went wrong on its own.
    console.error(`${method} ${path} could not reach GitHub:`, (error as Error).message);
    throw new GitHubError(
      `Could not reach GitHub. Check your network connection. (${(error as Error).message})`,
      0,
    );
  }

  if (!response.ok) {
    const failure = await toGitHubError(response);
    console.error(`${method} ${path} -> ${failure.status}: ${failure.message}`);
    throw failure;
  }
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}
