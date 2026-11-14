import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appSettings,
  describeSource,
  installApp,
  installLocations,
  listApps,
  resolveSource,
  saveSettings,
  uninstallApp,
} from "../src/appimage.ts";

/**
 * These run the real `assets/startappimage` (the vendored upstream CLI) against a throwaway
 * `$HOME`, so each check asserts our parsing against what the CLI actually prints, not against
 * a fixture of our own making.
 *
 * Deliberately absent: anything that needs `unsquashfs` (install, metadata preview) or the
 * network (update checks).
 */

const script = join(process.cwd(), "assets", "startappimage");
const scratch = mkdtempSync(join(tmpdir(), "appimage-manager-"));
const home = join(scratch, "home");
const appsDir = join(home, "apps");
const desktopDir = join(home, ".local", "share", "applications");
const appImage = join(appsDir, "Demo-2.1.AppImage");

const env: NodeJS.ProcessEnv = {
  HOME: home,
  PATH: process.env.PATH,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local", "share"),
  XDG_CACHE_HOME: join(home, ".cache"),
};

mkdirSync(appsDir, { recursive: true });
mkdirSync(desktopDir, { recursive: true });
writeFileSync(appImage, "");
chmodSync(appImage, 0o755);
writeFileSync(
  join(desktopDir, "demo.desktop"),
  [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Demo",
    'Exec="' + appImage + '" --flag %U',
    "Icon=demo-icon",
    "X-AppImage-Version=2.1",
    "",
  ].join("\n"),
);

let passed = 0;
let failed = 0;

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n  ${(error as Error).message}`);
  }
}

async function main() {
  await check("a launcher entry that runs an AppImage is adopted from its Exec line", async () => {
    // Measured shape: `list` adopts every desktop entry whose Exec runs an .AppImage, and reads
    // the version from X-AppImage-Version rather than guessing it from the file name.
    const apps = await listApps(script, env);
    assert.equal(apps.length, 1);
    const app = apps[0]!;
    assert.equal(app.id, "demo");
    assert.equal(app.name, "Demo");
    assert.equal(app.version, "2.1");
    assert.equal(app.external, true);
    assert.equal(app.sourceKind, "external");
    assert.equal(app.exec, appImage);
    assert.equal(app.icon, "", "no icon directories in the scratch home");
  });

  await check("an app's launch arguments come out of Exec, without the field code", async () => {
    const settings = await appSettings(script, "demo", env);
    assert.equal(settings.args, "--flag");
    assert.equal(settings.dir, appsDir);
    assert.equal(settings.hidden, false);
    assert.equal(settings.external, true);
  });

  await check("the install folders are the default plus every folder an app lives in", async () => {
    const locations = await installLocations(script, env);
    assert.equal(locations.default, join(home, ".local", "share", "appimages"));
    assert.deepEqual(
      locations.options.map((option) => option.path),
      [join(home, ".local", "share", "appimages"), appsDir],
    );
    assert.equal(locations.options[1]!.apps, 1);
  });

  await check("add --json reports a missing file as data, not as a thrown error", async () => {
    const outcome = await installApp(script, join(scratch, "nothing.AppImage"), {}, env);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.match(outcome.error, /no such file/);
  });

  await check("add --json names the folder field when the folder is outside the home", async () => {
    const outcome = await installApp(script, appImage, { dir: "/etc" }, env);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.field, "dir");
    assert.match(outcome.error, /inside your home/);
  });

  await check("set --json answers the same way for an app that does not exist", async () => {
    const outcome = await saveSettings(script, "nobody", { name: "x", dir: appsDir, args: "", source: "", hidden: false }, env);
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.match(outcome.error, /not installed: nobody/);
  });

  await check("a command that prints no JSON throws the CLI's own message", async () => {
    await assert.rejects(() => appSettings(script, "nobody", env), /not installed: nobody/);
  });

  await check("a source that is not owner/repo is refused without touching the network", async () => {
    const resolved = await resolveSource(script, "not-a-repo", env);
    assert.equal(resolved.ok, false);
    assert.equal(resolved.kind, "invalid");
  });

  await check("describeSource turns each sourceKind into one phrase", () => {
    assert.equal(describeSource({ sourceKind: "github", repo: "localsend/localsend" }), "GitHub · localsend/localsend");
    assert.equal(describeSource({ sourceKind: "url", repo: "" }), "Downloaded from a URL");
    assert.equal(describeSource({ sourceKind: "external", repo: "" }), "Added by another launcher");
    assert.equal(describeSource({ sourceKind: "local", repo: "" }), "Local file");
  });

  await check("removing an adopted app deletes its file, its launcher entry and its manifest", async () => {
    // Measured against the real CLI: this is the path a Vicinae Uninstall presses. It runs last
    // because it removes the fixture.
    const outcome = await uninstallApp(script, "demo", env);
    assert.equal(outcome.ok, true);
    assert.equal(existsSync(appImage), false, "the AppImage itself is deleted");
    assert.equal(existsSync(join(desktopDir, "demo.desktop")), false);
    assert.deepEqual(await listApps(script, env), []);
  });

  rmSync(scratch, { recursive: true, force: true });
  console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
