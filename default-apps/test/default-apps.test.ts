import assert from "node:assert/strict";
import { parseDesktopFile, isCandidateForCategory, CATEGORIES } from "../src/utils/defaults.ts";

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("ok   " + name);
  } catch (error) {
    console.log("FAIL " + name + ": " + (error as Error).message);
    process.exitCode = 1;
  }
}

check("parseDesktopFile reads Name and MimeType", () => {
  const text = `[Desktop Entry]\nName=Firefox\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\nCategories=Network;WebBrowser;\n`;
  const app = parseDesktopFile(text);
  assert.equal(app.name, "Firefox");
  assert.equal(app.mimes.has("x-scheme-handler/http"), true);
  assert.equal(app.categories.has("WebBrowser"), true);
});

check("isCandidateForCategory excludes WebBrowser for non-browser categories", () => {
  const app = parseDesktopFile(`[Desktop Entry]\nName=Firefox\nMimeType=audio/mpeg;\nCategories=Network;WebBrowser;\n`);
  const musicCat = CATEGORIES.find((c) => c.key === "music")!;
  assert.equal(isCandidateForCategory(app, musicCat), false);
});

check("isCandidateForCategory allows mail category apps", () => {
  const app = parseDesktopFile(`[Desktop Entry]\nName=Thunderbird\nMimeType=x-scheme-handler/mailto;\nCategories=Email;\n`);
  const mailCat = CATEGORIES.find((c) => c.key === "mail")!;
  assert.equal(isCandidateForCategory(app, mailCat), true);
});

if (process.exitCode && process.exitCode !== 0) {
  console.log("\nsome checks failed");
} else {
  console.log("\nall checks passed");
}
