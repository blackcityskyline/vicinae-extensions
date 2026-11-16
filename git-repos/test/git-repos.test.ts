import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findRepos, parsePath, resolvePath, tildifyPath, GitRepoType } from "../src/utils";
import { getCalculatedScore, getDecayScore } from "../src/hooks/useUsageBasedSort";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function initRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  fs.writeFileSync(path.join(dir, "file.txt"), "x");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
}

describe("parsePath", () => {
  it("expands ~, splits on the platform delimiter and separates the missing paths", () => {
    const [resolved, missing] = parsePath(`~${path.sep}dev${path.delimiter}${path.sep}definitely-not-here-xyz`);
    assert.deepEqual(resolved, [path.join(os.homedir(), "dev")]);
    assert.deepEqual(missing, ["/definitely-not-here-xyz"]);
  });

  it("ignores empty entries", () => {
    const [resolved, missing] = parsePath(`${path.delimiter}  ${path.delimiter}`);
    assert.deepEqual([resolved, missing], [[], []]);
  });
});

describe("tildifyPath", () => {
  it("replaces the home prefix and nothing else", () => {
    assert.equal(tildifyPath(path.join(os.homedir(), "dev", "me", "x")), `~${path.sep}dev${path.sep}me${path.sep}x`);
    assert.equal(tildifyPath("/opt/elsewhere"), "/opt/elsewhere");
  });
});

describe("usage score", () => {
  it("halves roughly every seven days and is zero without a use", () => {
    assert.equal(getCalculatedScore(), 0);
    assert.equal(getCalculatedScore({ usageCount: 3 }), 0);
    // The decay counts whole days rounded up, so a week is 7 or 8 days: 0.5
    // or 0.5**(8/7). A bound, not the formula, so the test does not restate it.
    const week = 7 * 24 * 60 * 60 * 1000;
    const oneWeek = getDecayScore(new Date(Date.now() - week));
    const twoWeeks = getDecayScore(new Date(Date.now() - 2 * week));
    assert.ok(oneWeek > 0.45 && oneWeek <= 0.5, `one week scored ${oneWeek}`);
    assert.ok(twoWeeks > 0.22 && twoWeeks < 0.26, `two weeks scored ${twoWeeks}`);
    assert.ok(
      getCalculatedScore({ lastUsed: new Date(Date.now() - week), usageCount: 3 }) >
        getCalculatedScore({ lastUsed: new Date(Date.now() - week), usageCount: 1 }),
    );
  });

  it("ranks a recent repository above an old one with the same count", () => {
    const today = new Date();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    assert.ok(getCalculatedScore({ lastUsed: today, usageCount: 1 }) > getCalculatedScore({ lastUsed: monthAgo, usageCount: 1 }));
  });
});

describe("findRepos", () => {
  let root: string;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "git-repos-test-"));
    initRepo(path.join(root, "base", "shallow"));
    initRepo(path.join(root, "base", "one", "nested"));
    initRepo(path.join(root, "base", "one", "two", "deep"));
    git(path.join(root, "base", "shallow"), "remote", "add", "origin", "https://github.com/raycast/extensions.git");
    // A worktree, plus a symlink to it: the same checkout under two names.
    git(path.join(root, "base", "shallow"), "worktree", "add", "-q", path.join(root, "base", "wt"), "-b", "wtbranch");
    fs.symlinkSync(path.join(root, "base", "wt"), path.join(root, "base", "link"));
    // A submodule, whose `.git` is a file pointing into the parent's git dir.
    const submoduleSource = path.join(root, "submodule-source");
    initRepo(submoduleSource);
    git(path.join(root, "base", "shallow"), "-c", "protocol.file.allow=always", "submodule", "add", "-q", submoduleSource, "vendor/sub");
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("respects the depth limit: a repository is found at its own depth, not one level deeper", async () => {
    const atTwo = await findRepos([path.join(root, "base")], 2, false);
    assert.deepEqual(
      atTwo.map((repo) => repo.name).sort(),
      ["nested", "shallow", "wt"],
    );
    const atThree = await findRepos([path.join(root, "base")], 3, false);
    assert.ok(atThree.some((repo) => repo.name === "deep"));
  });

  it("turns a git remote into an https url with the .git suffix gone", async () => {
    const [repo] = await findRepos([path.join(root, "base", "shallow")], 1, false);
    assert.ok(repo);
    assert.deepEqual(repo.remotes, [
      { name: "origin", host: "github.com", url: "https://github.com/raycast/extensions" },
    ]);
  });

  it("finds a worktree once, even when a symlink reaches the same checkout", async () => {
    const repos = await findRepos([path.join(root, "base")], 2, false);
    const worktrees = repos.filter((repo) => repo.repoType === GitRepoType.Worktree);
    assert.equal(worktrees.length, 1);
    assert.equal(worktrees[0]?.name, "wt");
  });

  it("lists a submodule only when asked to, and as a submodule", async () => {
    const without = await findRepos([path.join(root, "base")], 2, false);
    assert.ok(!without.some((repo) => repo.repoType === GitRepoType.Submodule));
    const withSubmodules = await findRepos([path.join(root, "base")], 2, true);
    const submodules = withSubmodules.filter((repo) => repo.repoType === GitRepoType.Submodule);
    assert.equal(submodules.length, 1);
    assert.equal(submodules[0]?.name, "sub");
  });

  it("returns the repositories sorted by name", async () => {
    const repos = await findRepos([path.join(root, "base")], 2, false);
    assert.deepEqual(
      repos.map((repo) => repo.name),
      [...repos.map((repo) => repo.name)].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)),
    );
  });
});

describe("resolvePath", () => {
  it("expands a leading ~ and leaves an absolute path alone", () => {
    assert.equal(resolvePath("~/dev"), path.join(os.homedir(), "dev"));
    assert.equal(resolvePath("/opt/x"), "/opt/x");
  });
});
