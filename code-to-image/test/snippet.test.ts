import assert from "node:assert/strict";

import {
  apiErrorMessage,
  expandHome,
  fileName,
  formatFromContentType,
  parseCatalog,
  validateCode,
} from "../src/utils/snippet.ts";

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

check("expandHome expands only the home shortcut", () => {
  assert.equal(expandHome("~/Pictures/code", "/home/black"), "/home/black/Pictures/code");
  assert.equal(expandHome("~", "/home/black"), "/home/black");
  assert.equal(expandHome("", "/home/black"), "/home/black");
  assert.equal(expandHome("/srv/images", "/home/black"), "/srv/images");
  assert.equal(expandHome("relative/dir", "/home/black"), "relative/dir");
});

check("fileName is a sortable local timestamp with the real extension", () => {
  const date = new Date(2026, 10, 20, 13, 5, 9);
  assert.equal(fileName(date, "png"), "code-2026-11-20-13-05-09.png");
  assert.equal(fileName(date, "svg"), "code-2026-11-20-13-05-09.svg");
});

check("formatFromContentType trusts only the two types the API returns", () => {
  assert.equal(formatFromContentType("image/png"), "png");
  assert.equal(formatFromContentType("image/svg+xml; charset=utf-8"), "svg");
  assert.equal(formatFromContentType("text/html"), null);
  assert.equal(formatFromContentType(null), null);
});

check("apiErrorMessage keeps the service's own wording and hint", () => {
  // Measured 2026-11-20 against POST /api/image with an empty code.
  const body = JSON.stringify({
    error: '"code" is required (string, max 20000 chars)',
    code: "missing_code",
    hint: 'Pass the snippet as the "code" field (POST body) or ?code= (GET).',
  });
  const message = apiErrorMessage(400, body);
  assert.match(message, /required \(string, max 20000 chars\)/);
  assert.match(message, /Pass the snippet/);

  assert.equal(apiErrorMessage(502, "<html>bad gateway</html>"), "codetoimage.com answered HTTP 502");
  assert.equal(apiErrorMessage(500, JSON.stringify({ error: "render failed" })), "render failed");
});

check("parseCatalog keeps id/label pairs and drops malformed entries", () => {
  const raw = JSON.stringify({
    themes: [
      { id: "github-dark", label: "GitHub Dark", type: "dark" },
      { id: 7, label: "broken" },
      { label: "no id" },
    ],
    languages: [
      { id: "python", label: "Python" },
      { id: "zig", label: "Zig" },
    ],
    gradients: [{ id: "sunset", label: "Sunset", css: "linear-gradient(...)" }],
  });

  assert.deepEqual(parseCatalog(raw), {
    languages: [
      { id: "python", label: "Python" },
      { id: "zig", label: "Zig" },
    ],
    themes: [{ id: "github-dark", label: "GitHub Dark" }],
  });

  assert.equal(parseCatalog("not json"), null);
  assert.equal(parseCatalog(JSON.stringify({ languages: [] })), null);
  assert.equal(parseCatalog(JSON.stringify({ languages: [], themes: [] })), null);
});

check("validateCode reports the documented limits", () => {
  assert.equal(validateCode("print(1)"), null);
  assert.match(validateCode("   \n\t ") ?? "", /Paste some code/);
  const long = "x".repeat(20_001);
  assert.match(validateCode(long) ?? "", /20,000 characters/);
  const tall = Array.from({ length: 501 }, () => "x").join("\n");
  assert.match(validateCode(tall) ?? "", /500 lines/);
});

console.log(failures === 0 ? `\nall checks passed` : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
