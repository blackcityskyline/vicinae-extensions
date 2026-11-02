import assert from "node:assert/strict";
import {
  slugifyName,
  normalizeUrl,
  validateName,
  validateUrl,
  desktopStringEscape,
  desktopExecArg,
  buildDesktopExec,
  isWebappDesktop,
  parseWebappList,
} from "../src/utils/webapp.ts";

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("ok   " + name);
  } catch (error) {
    console.log("FAIL " + name + ": " + (error as Error).message);
    process.exitCode = 1;
  }
}

check("slugifyName lowercases and replaces non-alnum with dashes", () => {
  assert.equal(slugifyName("My Web App"), "my-web-app");
  assert.equal(slugifyName("Test!!App"), "test-app");
});

check("normalizeUrl adds https when missing", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com");
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
});

check("validateName rejects empty and slash", () => {
  assert.equal(validateName(""), "Name is required");
  assert.equal(validateName("  "), "Name is required");
  assert.equal(validateName("foo/bar"), "Name cannot contain \"/\"");
  assert.equal(validateName("My App"), null);
});

check("validateUrl requires http/https", () => {
  assert.equal(validateUrl(""), "URL is required");
  assert.equal(validateUrl("   "), "URL is required");
  assert.equal(validateUrl("example.com/path"), null);
  assert.equal(validateUrl("http://x"), null);
});

check("desktopStringEscape escapes backslashes and newlines", () => {
  assert.equal(desktopStringEscape("a\\b"), "a\\\\b");
  assert.equal(desktopStringEscape("a\nb"), "a\\nb");
});

check("desktopExecArg quotes and escapes", () => {
  assert.equal(desktopExecArg("hello"), '"hello"');
  assert.equal(desktopExecArg('he"llo'), '"he\\"llo"');
});

check("buildDesktopExec includes backend and flags", () => {
  const cmd = buildDesktopExec("/tmp/launcher", "helium", "https://example.com", ["--incognito"]);
  assert.ok(cmd.includes("--backend"));
  assert.ok(cmd.includes("helium"));
  assert.ok(cmd.includes("--incognito"));
  assert.ok(cmd.includes("example.com"));
});

check("isWebappDesktop detects webapp-launch", () => {
  assert.equal(isWebappDesktop("Exec=/x/webapp-launch --backend a https://x\n"), true);
  assert.equal(isWebappDesktop("Exec=/usr/bin/firefox https://x\n"), false);
});

check("parseWebappList extracts desktop basenames", () => {
  const apps = parseWebappList("/home/x/.local/share/applications/MyApp.desktop\n/foo/Other.desktop\n");
  assert.deepEqual(apps, ["MyApp", "Other"]);
});

if (process.exitCode && process.exitCode !== 0) {
  console.log("\nsome checks failed");
} else {
  console.log("\nall checks passed");
}
