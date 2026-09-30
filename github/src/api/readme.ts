import { GitHubError } from "./client.ts";
import { getReadmePayload } from "./github.ts";
import { decodeReadme, readmeTitle, truncateReadme } from "../utils/readme.ts";

/**
 * README fetching. Lives in `api/` because it does network I/O; the decoding and
 * truncation it relies on live in `src/utils/readme.ts` so they stay testable
 * without a token.
 */

export type Readme = {
  title: string;
  markdown: string;
  truncated: boolean;
  /** Set when the repository has no README, so the view can say so plainly. */
  missing: boolean;
};

async function fetchLargeReadme(downloadUrl: string): Promise<string> {
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new GitHubError(`Could not download the README (${response.status}).`, response.status);
  return response.text();
}

/**
 * Fetch a repository README, already decoded and bounded.
 *
 * GitHub answers 404 for a repository with no README. That is a normal outcome
 * rather than a failure, so it resolves to `missing: true`; every other status
 * propagates, because a 403 or a network error is something the reader has to
 * know about.
 */
export async function getReadme(fullName: string): Promise<Readme> {
  const [owner = "", name = ""] = fullName.split("/");
  if (owner === "" || name === "") {
    return { title: fullName, markdown: "", truncated: false, missing: true };
  }

  let payload;
  try {
    payload = await getReadmePayload(owner, name);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return { title: fullName, markdown: "", truncated: false, missing: true };
    }
    throw error;
  }

  let raw: string;
  if (payload.encoding === "base64") {
    raw = decodeReadme(payload.content, "base64");
  } else if (payload.content !== "") {
    raw = payload.content;
  } else {
    // Files over 1 MB arrive with encoding "none" and an empty body.
    raw = await fetchLargeReadme(payload.download_url);
  }

  const { markdown, truncated } = truncateReadme(raw);
  return { title: readmeTitle(payload.name, fullName), markdown, truncated, missing: markdown.trim() === "" };
}
