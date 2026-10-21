import assert from "node:assert/strict";

import { GitHubError } from "../src/api/client.ts";
import {
  getReadmePayload,
  listAccessibleRepositories,
  listBranches,
  searchRepositories,
} from "../src/api/github.ts";
import { decodeReadme } from "../src/utils/readme.ts";
import { token } from "./vicinae-api-shim.ts";

/**
 * The backend check: every command in this extension is a call to
 * api.github.com, so this drives that endpoint instead of a stub.
 *
 * Always: the two answers that must not be invented — no token at all stops
 * before the request, and a token GitHub does not know comes back as the 401
 * sentence `describeFailure` writes. The second one is a real request to the
 * real API, so it also proves the transport.
 *
 * With a token: the read-only calls the extension makes, checked against the
 * fields the rows render. Nothing here writes anything — no stars, no issues,
 * no workflow runs — because a test must not change the account it runs on.
 *
 * `tsx --tsconfig test/tsconfig.backend.json` is required: `@vicinae/api` reads
 * its environment at import time and cannot load outside the launcher.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

const ORIGINAL = process.env.GITHUB_TOKEN;
const TOKEN = token();

function skip(name: string, reason: string): void {
  skipped += 1;
  console.log(`SKIP ${name} (${reason})`);
}

function fail(name: string, error: unknown): void {
  failed += 1;
  console.log(`FAIL ${name}`);
  console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
}

/** Run the body against the real endpoint; offline is a skip, not a failure. */
async function online<T>(name: string, body: () => Promise<T>): Promise<T | undefined> {
  try {
    const value = await body();
    passed += 1;
    console.log(`ok   ${name}`);
    return value;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 0) {
      skip(name, "no route to api.github.com");
      return undefined;
    }
    fail(name, error);
    return undefined;
  }
}

/** `client.ts` reads the token on every request, so this is enough to vary it. */
async function withToken<T>(value: string, body: () => Promise<T>): Promise<T> {
  process.env.GITHUB_TOKEN = value;
  try {
    return await body();
  } finally {
    if (ORIGINAL === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = ORIGINAL;
  }
}

function rejectedBy(reason: RegExp, status: number) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof GitHubError, `expected GitHubError, got ${String(error)}`);
    assert.equal(error.status, status);
    assert.match(error.message, reason);
    return true;
  };
}

async function main(): Promise<void> {
  await online("a request with no token never leaves the machine", async () => {
    await withToken("", () =>
      assert.rejects(
        searchRepositories("stars:>1000"),
        rejectedBy(/Set a GitHub personal access token/, 401),
      ),
    );
  });

  await online("a token GitHub does not know is refused with a sentence, not a status", async () => {
    await withToken(`ghp_${"a".repeat(36)}`, () =>
      assert.rejects(
        searchRepositories("stars:>1000"),
        rejectedBy(/rejected the personal access token/, 401),
      ),
    );
  });

  if (TOKEN === "") {
    skip("a repository search answers with rows", "no GitHub token");
    skip("a README comes back and decodes", "no GitHub token");
    skip("branches answer with a sha", "no GitHub token");
    skip("the account's own repositories answer", "no GitHub token");
    skip("a missing repository is a 404 that says so", "no GitHub token");
  } else {
    await online("a repository search answers with rows", async () => {
      const rows = await searchRepositories("language:rust stars:>10000", 1);
      assert.ok(rows.length > 0, "the search returned nothing");
      for (const row of rows) {
        assert.match(row.full_name, /^[^/]+\/[^/]+$/, `odd full_name: ${row.full_name}`);
        assert.ok(row.owner?.login, `row without an owner: ${row.full_name}`);
        assert.match(row.html_url, /^https:\/\/github\.com\//);
        assert.equal(typeof row.stargazers_count, "number");
      }
    });

    await online("a README comes back and decodes", async () => {
      const payload = await getReadmePayload("torvalds", "linux");
      assert.equal(payload.encoding, "base64");
      assert.ok(payload.size > 0, "GitHub reported an empty README");
      const markdown = decodeReadme(payload.content, payload.encoding);
      assert.ok(markdown.length > 0, "the base64 payload decoded to nothing");
      assert.ok(!markdown.includes("\u0000"), "the decoded README is not text");
    });

    await online("branches answer with a sha", async () => {
      const rows = await listBranches("torvalds", "linux");
      assert.ok(rows.length > 0, "no branches came back");
      for (const branch of rows) {
        assert.ok(branch.name, "a branch without a name");
        assert.match(branch.commit?.sha ?? "", /^[0-9a-f]{40}$/, `odd sha on ${branch.name}`);
      }
    });

    await online("the account's own repositories answer", async () => {
      const rows = await listAccessibleRepositories("updated", 1);
      assert.ok(rows.length > 0, "the token reached no repositories at all");
      for (const row of rows) {
        assert.match(row.full_name, /^[^/]+\/[^/]+$/);
        assert.equal(typeof row.private, "boolean");
      }
    });

    await online("a missing repository is a 404 that says so", async () => {
      await assert.rejects(
        getReadmePayload("torvalds", "definitely-not-a-repository-xyz"),
        rejectedBy(/Not found\./, 404),
      );
    });
  }

  console.log(
    `\npassed: ${passed}, failed: ${failed}, skipped: ${skipped}` +
      (TOKEN === "" ? " — no GitHub token found; set GITHUB_TOKEN to run the read-only checks" : ""),
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
