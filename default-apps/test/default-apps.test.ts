import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { queryCategory, readDesktopApps, setDefault, XdgMimeMissing } from "../src/api/defaults.ts";
import { CATEGORIES } from "../src/utils/categories.ts";
import { applicationDirs, candidatesFor, parseDesktopEntry, summarizeDefaults } from "../src/utils/desktop.ts";

let failed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const category = (key: string) => CATEGORIES.find((c) => c.key === key)!;
const app = (id: string, body: string) => parseDesktopEntry(id, `[Desktop Entry]\n${body}\n`)!;

// --- parsing -------------------------------------------------------------

check("a desktop entry yields its name, types and menu categories", () => {
  const entry = app("firefox.desktop", "Name=Firefox\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\nCategories=Network;WebBrowser;");
  assert.equal(entry.id, "firefox.desktop");
  assert.equal(entry.name, "Firefox");
  assert.deepEqual([...entry.mimes], ["x-scheme-handler/http", "x-scheme-handler/https"]);
  assert.deepEqual([...entry.categories], ["Network", "WebBrowser"]);
});

check("localised names and action groups do not replace the name", () => {
  const entry = parseDesktopEntry(
    "a.desktop",
    "[Desktop Entry]\nName[ru]=Браузер\nName=Browser\n\n[Desktop Action new-window]\nName=New Window\nMimeType=text/x-wrong;\n",
  )!;
  assert.equal(entry.name, "Browser");
  assert.equal(entry.mimes.has("text/x-wrong"), false);
});

check("a deleted entry or one without a name is not an application", () => {
  assert.equal(parseDesktopEntry("a.desktop", "[Desktop Entry]\nName=A\nHidden=true\n"), null);
  assert.equal(parseDesktopEntry("a.desktop", "[Desktop Entry]\nExec=a\n"), null);
});

// --- candidates ----------------------------------------------------------

check("a browser is offered as a browser and nowhere else", () => {
  const firefox = app("firefox.desktop", "Name=Firefox\nMimeType=x-scheme-handler/http;audio/mpeg;\nCategories=Network;WebBrowser;Audio;");
  assert.deepEqual(candidatesFor([firefox], category("browser")), [{ id: "firefox.desktop", name: "Firefox" }]);
  assert.deepEqual(candidatesFor([firefox], category("music")), []);
});

check("an application must declare a type of the category", () => {
  const editor = app("kate.desktop", "Name=Kate\nCategories=TextEditor;");
  assert.deepEqual(candidatesFor([editor], category("editor")), []);
});

check("a category that names menu categories requires one of them", () => {
  const mailto = "MimeType=x-scheme-handler/mailto;";
  const thunderbird = app("tb.desktop", `Name=Thunderbird\n${mailto}\nCategories=Email;`);
  const other = app("o.desktop", `Name=Other\n${mailto}\nCategories=Utility;`);
  assert.deepEqual(candidatesFor([thunderbird, other], category("mail")).map((c) => c.id), ["tb.desktop"]);
});

check("candidates are sorted by name, ignoring case", () => {
  const body = (name: string) => `Name=${name}\nMimeType=audio/mpeg;\nCategories=Audio;`;
  const names = candidatesFor([app("b.desktop", body("beta")), app("a.desktop", body("Alpha")), app("c.desktop", body("Gamma"))], category("music")).map((c) => c.name);
  assert.deepEqual(names, ["Alpha", "beta", "Gamma"]);
});

// --- directories ---------------------------------------------------------

check("directories follow the XDG variables, then Flatpak, without repeats", () => {
  assert.deepEqual(
    applicationDirs({ HOME: "/home/u", XDG_DATA_HOME: "/data", XDG_DATA_DIRS: "/run/current-system/sw/share:/usr/share/:/data" }),
    [
      "/data/applications",
      "/run/current-system/sw/share/applications",
      "/usr/share/applications",
      "/home/u/.local/share/flatpak/exports/share/applications",
      "/var/lib/flatpak/exports/share/applications",
    ],
  );
});

check("unset variables fall back to the specification's defaults", () => {
  assert.deepEqual(applicationDirs({ HOME: "/home/u" }).slice(0, 3), [
    "/home/u/.local/share/applications",
    "/usr/local/share/applications",
    "/usr/share/applications",
  ]);
});

check("Guix profiles are scanned, and a relative entry is ignored", () => {
  const dirs = applicationDirs({ HOME: "/h", XDG_DATA_DIRS: "relative:/usr/share", GUIX_PROFILE: "/p", GUIX_ENVIRONMENT: "/e" });
  assert.equal(dirs.includes("/p/share/applications"), true);
  assert.equal(dirs.includes("/e/share/applications"), true);
  assert.equal(dirs.some((dir) => dir.startsWith("relative")), false);
});

// --- reading the answers -------------------------------------------------

check("types that disagree are reported as mixed", () => {
  assert.deepEqual(summarizeDefaults(["a.desktop", "a.desktop"]), { id: "a.desktop", mixed: false });
  assert.deepEqual(summarizeDefaults(["a.desktop", "b.desktop"]), { id: "a.desktop", mixed: true });
  assert.deepEqual(summarizeDefaults([null, null]), { id: null, mixed: false });
  assert.deepEqual(summarizeDefaults(["a.desktop", null]), { id: "a.desktop", mixed: true });
});

// --- the filesystem and xdg-mime ----------------------------------------

const scratch = mkdtempSync(join(tmpdir(), "default-apps-test-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

check("an earlier directory hides the same file in a later one, and gaps are tolerated", async () => {
  const first = join(scratch, "first");
  const second = join(scratch, "second");
  mkdirSync(first);
  mkdirSync(second);
  writeFileSync(join(first, "a.desktop"), "[Desktop Entry]\nName=From first\n");
  writeFileSync(join(second, "a.desktop"), "[Desktop Entry]\nName=From second\n");
  writeFileSync(join(second, "b.desktop"), "[Desktop Entry]\nName=B\n");
  writeFileSync(join(second, "notes.txt"), "ignored");
  const apps = await readDesktopApps([first, join(scratch, "missing"), second]);
  assert.deepEqual(apps.map((a) => [a.id, a.name]).sort(), [["a.desktop", "From first"], ["b.desktop", "B"]]);
});

/** Runs `fn` with PATH pointing at `bin` only, restoring it afterwards. */
async function withPath<T>(bin: string, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.PATH;
  process.env.PATH = bin;
  try {
    return await fn();
  } finally {
    process.env.PATH = saved;
  }
}

check("xdg-mime missing is reported as such", async () => {
  const empty = join(scratch, "empty-bin");
  mkdirSync(empty);
  await withPath(empty, async () => {
    await assert.rejects(queryCategory(category("browser")), XdgMimeMissing);
  });
});

check("setting a default passes the application and every type of the category", async () => {
  const bin = join(scratch, "fake-bin");
  const log = join(scratch, "argv.log");
  mkdirSync(bin);
  // Answers every query with the application it was last told to use.
  writeFileSync(
    join(bin, "xdg-mime"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nif [ "$1" = default ]; then printf '%s\\n' "$2" > "${log}.app"; else read -r app < "${log}.app"; echo "$app"; fi\n`,
  );
  chmodSync(join(bin, "xdg-mime"), 0o755);
  await withPath(bin, async () => {
    await setDefault(category("browser"), "firefox.desktop");
  });
  assert.equal(readFileSync(log, "utf8").split("\n")[0], "default firefox.desktop x-scheme-handler/http x-scheme-handler/https");
});

check("a default that xdg-mime accepted but does not report is an error", async () => {
  const bin = join(scratch, "liar-bin");
  mkdirSync(bin);
  // Exits 0 on `default`, as the real one does for an application that does not exist.
  writeFileSync(join(bin, "xdg-mime"), `#!/bin/sh\nif [ "$1" = default ]; then exit 0; fi\necho other.desktop\n`);
  chmodSync(join(bin, "xdg-mime"), 0o755);
  await withPath(bin, async () => {
    await assert.rejects(setDefault(category("browser"), "firefox.desktop"), /still reports other\.desktop/);
  });
});

const realXdgMime = spawnSync("xdg-mime", ["--version"]).status === 0;

check("a round trip through the real xdg-mime", async () => {
  if (!realXdgMime) {
    console.log("skip real xdg-mime is not installed");
    return;
  }
  const home = join(scratch, "home");
  const apps = join(home, "data", "applications");
  mkdirSync(apps, { recursive: true });
  // `xdg-mime default` touches a file in the config home and does not create
  // the directory itself.
  mkdirSync(join(home, "cfg"), { recursive: true });
  // xdg-mime only reports an application whose Exec binary is on PATH, so
  // `/bin/true` stands in for one; a bare name can resolve to a shell builtin,
  // which its `-e` check rejects.
  for (const id of ["one", "two"]) {
    writeFileSync(
      join(apps, `${id}.desktop`),
      `[Desktop Entry]\nType=Application\nName=${id}\nExec=/bin/true %u\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\n`,
    );
  }
  const saved = { ...process.env };
  Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: join(home, "cfg"), XDG_DATA_HOME: join(home, "data"), XDG_DATA_DIRS: join(home, "none") });
  try {
    await setDefault(category("browser"), "two.desktop");
    assert.deepEqual(await queryCategory(category("browser")), { id: "two.desktop", mixed: false });
    await setDefault(category("browser"), "one.desktop");
    assert.deepEqual(await queryCategory(category("browser")), { id: "one.desktop", mixed: false });
    // An application that is not installed is refused, whatever xdg-mime's exit status says.
    await assert.rejects(setDefault(category("browser"), "nosuch.desktop"));
  } finally {
    process.env = saved;
  }
});

async function main() {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log("ok   " + name);
    } catch (error) {
      failed++;
      console.log("FAIL " + name + ": " + (error as Error).message);
    }
  }
  console.log(failed ? `\n${failed} failed` : `\nall ${tests.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

void main();
