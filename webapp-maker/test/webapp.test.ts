import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageKind, touchIconUrl } from "../src/api/icon.ts";
import { createWebapp, listWebapps, readWebapp, removeWebapp, updateWebapp } from "../src/api/webapp.ts";
import { LAUNCHER_SCRIPT } from "../src/utils/launcher-script.ts";
import {
  buildDesktopEntry,
  buildDesktopExec,
  desktopExecArg,
  desktopStringEscape,
  isWebappDesktop,
  normalizeUrl,
  parseEnvFile,
  parseWebappExec,
  readEntryField,
  slugifyName,
  validateName,
  validateUrl,
} from "../src/utils/webapp.ts";

let failed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const check = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// A real PNG: 1x1, produced once and embedded so the checks need no tooling.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAEAgH/9mqGBQAAAABJRU5ErkJggg==",
  "base64",
);

// --- pure ----------------------------------------------------------------

check("a name becomes a lowercase slug", () => {
  assert.equal(slugifyName("My Web App"), "my-web-app");
  assert.equal(slugifyName("  --Test!!App--"), "test-app");
});

check("a missing scheme becomes https; other schemes are kept and then refused", () => {
  assert.equal(normalizeUrl("example.com/a"), "https://example.com/a");
  assert.equal(normalizeUrl("http://example.com"), "http://example.com");
  assert.equal(validateUrl("javascript:alert(1)"), "URL must be http or https");
  assert.equal(validateUrl("file:///etc/passwd"), "URL must be http or https");
  assert.equal(validateUrl("https://a b"), "URL must not contain whitespace");
  assert.equal(validateUrl("  "), "URL is required");
  assert.equal(validateUrl("example.com"), null);
});

check("a name may not be empty or contain a slash", () => {
  assert.equal(validateName(" "), "Name is required");
  assert.equal(validateName("a/b"), 'Name cannot contain "/"');
  assert.equal(validateName("../x"), 'Name cannot contain "/"');
  assert.equal(validateName("My App"), null);
});

check("Exec arguments are quoted against the desktop entry specification", () => {
  assert.equal(desktopExecArg('a"b$c`d%e\\f'), '"a\\"b\\$c\\`d%%e\\\\f"');
});

check("what is written can be read back, whatever the flags hold", () => {
  const flags = ['--user-agent=a"b$c%d\\e', "--incognito", "--x=`y`"];
  const exec = buildDesktopExec("/home/u/.local/share/vicinae/webapp-launch", "helium", "https://e.com/a?b=1&c=%20d", flags);
  const content = buildDesktopEntry({ name: "My App", exec, icon: "my-app" });
  assert.equal(readEntryField(content, "Name"), "My App");
  assert.equal(readEntryField(content, "Icon"), "my-app");
  assert.deepEqual(parseWebappExec(readEntryField(content, "Exec")!), {
    backend: "helium",
    url: "https://e.com/a?b=1&c=%20d",
    flags,
  });
});

check("an entry made by the Noctalia plugin, with no --backend, parses too", () => {
  const exec = '"/x/webapp-launch" "https://e.com" "--incognito"';
  assert.deepEqual(parseWebappExec(exec), { backend: "auto", url: "https://e.com", flags: ["--incognito"] });
});

check("an ordinary application is not a web app", () => {
  assert.equal(parseWebappExec('"/usr/bin/firefox" "https://e.com"'), null);
  assert.equal(isWebappDesktop("Exec=/usr/bin/firefox %u\n"), false);
  assert.equal(isWebappDesktop('Exec="/x/webapp-launch" --backend "a" "https://e.com"\n'), true);
});

check("string values keep leading spaces and newlines", () => {
  assert.equal(desktopStringEscape(" a\nb\\"), "\\sa\\nb\\\\");
  assert.equal(readEntryField(`Name=${desktopStringEscape(" a\nb\\")}\n`, "Name"), " a\nb\\");
});

check("an environment file is read as KEY=VALUE lines", () => {
  const env = parseEnvFile('# proxy\nexport HTTPS_PROXY="http://p:3128"\nNO_PROXY=localhost\n\nbad line\n');
  assert.deepEqual(env, { HTTPS_PROXY: "http://p:3128", NO_PROXY: "localhost" });
});

check("only real images are images", () => {
  assert.equal(imageKind(PNG), "png");
  assert.equal(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
  assert.equal(imageKind(Buffer.from("<!doctype html>")), null);
  assert.equal(imageKind(Buffer.alloc(0)), null);
});

check("the touch icon is resolved against the page it came from", () => {
  const page = (href: string) => `<head><link rel="apple-touch-icon" sizes="180x180" href="${href}"></head>`;
  assert.equal(touchIconUrl(page("/i.png"), "https://e.com/app/x"), "https://e.com/i.png");
  assert.equal(touchIconUrl(page("i.png"), "https://e.com/app/x"), "https://e.com/app/i.png");
  assert.equal(touchIconUrl(page("//cdn.e.com/i.png"), "https://e.com"), "https://cdn.e.com/i.png");
  assert.equal(touchIconUrl("<link rel=icon href=/f.ico>", "https://e.com"), null);
});

// --- the launcher script, run for real ----------------------------------

const scratch = mkdtempSync(join(tmpdir(), "webapp-maker-test-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

check("the launcher starts the chosen browser in app mode and passes the flags through", () => {
  const bin = join(scratch, "launcher-bin");
  const log = join(scratch, "browser.log");
  mkdirSync(bin);
  writeFileSync(join(bin, "chromium"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\n`);
  chmodSync(join(bin, "chromium"), 0o755);
  const script = join(scratch, "webapp-launch");
  writeFileSync(script, LAUNCHER_SCRIPT, { mode: 0o755 });
  const run = spawnSync(script, ["--backend", "chromium", "https://e.com/?a=1&b=2", "--incognito", "--x=a b"], {
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: scratch },
  });
  assert.equal(run.status, 0, String(run.stderr));
  // setsid detaches the browser, so the fake may finish after the script returns.
  for (let i = 0; i < 50 && !existsSync(log); i++) spawnSync("sleep", ["0.05"]);
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), ["--app=https://e.com/?a=1&b=2", "--incognito", "--x=a b"]);
});

// --- the API, against a real local server and a throwaway HOME -----------

async function withSite<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end('<link rel="apple-touch-icon" href="/touch.png">');
    } else if (req.url === "/touch.png") {
      res.setHeader("content-type", "image/png");
      res.end(PNG);
    } else if (req.url === "/bare") {
      res.setHeader("content-type", "text/html");
      res.end("<html>no icon here</html>");
    } else if (req.url === "/error.png") {
      // A 200 that is not an image, which is what a site's error page usually is.
      res.setHeader("content-type", "text/html");
      res.end("<html>Not found</html>");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

const launcherPath = "/x/webapp-launch";
const input = (overrides: Record<string, string>) => ({
  name: "Site",
  url: "",
  flags: "",
  icon: "",
  backend: "auto",
  envFile: "",
  launcherPath,
  ...overrides,
});

check("create, list, edit, rename and remove a web app end to end", async () => {
  const home = join(scratch, "home1");
  mkdirSync(home);
  process.env.HOME = home;
  await withSite(async (base) => {
    const created = await createWebapp(input({ name: "My Site", url: base, flags: '--user-agent=a"b$c%d --incognito' }));
    assert.deepEqual(created.ok, true, created.message);
    const icon = join(home, ".local/share/icons/hicolor/256x256/apps/my-site.png");
    assert.equal(imageKind(readFileSync(icon)), "png");
    assert.deepEqual(readdirSync(join(home, ".local/share/icons/hicolor/256x256/apps")), ["my-site.png"], "no .part file is left");

    assert.deepEqual(await listWebapps(), ["My Site"]);
    assert.deepEqual(await readWebapp("My Site"), {
      name: "My Site",
      url: base,
      flags: '--user-agent=a"b$c%d --incognito',
      icon: "my-site",
      backend: "auto",
    });

    const again = await createWebapp(input({ name: "My Site", url: base }));
    assert.equal(again.ok, false);
    assert.match(again.message, /already exists/);

    // Editing the address keeps the flags; renaming moves the icon with it.
    const updated = await updateWebapp("My Site", {
      name: "Renamed",
      url: `${base}/other`,
      flags: '--user-agent=a"b$c%d --incognito',
      icon: "my-site",
      backend: "chromium",
      envFile: "",
      launcherPath,
    });
    assert.equal(updated.ok, true, updated.message);
    assert.deepEqual(await listWebapps(), ["Renamed"]);
    assert.deepEqual(await readWebapp("Renamed"), {
      name: "Renamed",
      url: `${base}/other`,
      flags: '--user-agent=a"b$c%d --incognito',
      icon: "renamed",
      backend: "chromium",
    });
    assert.equal(existsSync(join(home, ".local/share/icons/hicolor/256x256/apps/renamed.png")), true);
    assert.equal(existsSync(icon), false);

    const removed = await removeWebapp("Renamed");
    assert.equal(removed.ok, true, removed.message);
    assert.deepEqual(await listWebapps(), []);
    assert.deepEqual(readdirSync(join(home, ".local/share/icons/hicolor/256x256/apps")), []);
  });
});

check("an icon address that answers with a page is refused and leaves nothing behind", async () => {
  const home = join(scratch, "home2");
  mkdirSync(home);
  process.env.HOME = home;
  await withSite(async (base) => {
    const result = await createWebapp(input({ name: "Bad", url: base, icon: `${base}/error.png` }));
    assert.equal(result.ok, false);
    assert.match(result.message, /not an image/);
    assert.deepEqual(await listWebapps(), []);
    assert.deepEqual(readdirSync(join(home, ".local/share/icons/hicolor/256x256/apps")), []);
  });
});

check("a site without a touch icon falls through to the next source, and fails clearly when none works", async () => {
  const home = join(scratch, "home3");
  mkdirSync(home);
  process.env.HOME = home;
  // Offline here: /bare has no touch icon, /apple-touch-icon.png is a 404, and Google's service is unreachable.
  await withSite(async (base) => {
    const result = await createWebapp(input({ name: "Bare", url: `${base}/bare` }));
    assert.equal(result.ok, false);
    assert.match(result.message, /No icon could be fetched/);
  });
});

check("a theme icon name needs no file", async () => {
  const home = join(scratch, "home4");
  mkdirSync(home);
  process.env.HOME = home;
  const result = await createWebapp(input({ name: "Themed", url: "https://e.com", icon: "web-browser" }));
  assert.equal(result.ok, true, result.message);
  assert.equal((await readWebapp("Themed"))?.icon, "web-browser");
});

check("only web apps can be removed, and the name is not a path", async () => {
  const home = join(scratch, "home5");
  const apps = join(home, ".local/share/applications");
  mkdirSync(apps, { recursive: true });
  process.env.HOME = home;
  writeFileSync(join(apps, "Firefox.desktop"), "[Desktop Entry]\nName=Firefox\nExec=firefox %u\n");
  assert.match((await removeWebapp("Firefox")).message, /not a web app/);
  assert.equal(existsSync(join(apps, "Firefox.desktop")), true);
  assert.equal((await removeWebapp("../applications/Firefox")).ok, false);
  assert.equal(existsSync(join(apps, "Firefox.desktop")), true);
});

check("the environment file reaches curl", async () => {
  const home = join(scratch, "home6");
  const bin = join(scratch, "curl-bin");
  mkdirSync(home);
  mkdirSync(bin);
  const seen = join(scratch, "curl-env.log");
  writeFileSync(join(scratch, "icon.png"), PNG);
  // A curl that records the variable and answers like a download would.
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh\nprintf '%s' "$WEBAPP_TEST_VAR" > "${seen}"\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done\n[ -n "$out" ] && cp "${join(scratch, "icon.png")}" "$out"\n`,
  );
  chmodSync(join(bin, "curl"), 0o755);
  const envFile = join(scratch, "env");
  writeFileSync(envFile, "export WEBAPP_TEST_VAR=from-the-file\n");
  process.env.HOME = home;
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}:${savedPath}`;
  try {
    const result = await createWebapp(input({ name: "Env", url: "https://e.com", icon: "https://e.com/i.png", envFile }));
    assert.equal(result.ok, true, result.message);
    assert.equal(readFileSync(seen, "utf8"), "from-the-file");
    const missing = await createWebapp(input({ name: "Env2", url: "https://e.com", icon: "https://e.com/i.png", envFile: join(scratch, "nope") }));
    assert.match(missing.message, /cannot be read/);
  } finally {
    process.env.PATH = savedPath;
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
