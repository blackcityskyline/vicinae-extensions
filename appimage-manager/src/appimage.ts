import { execFile, spawn } from "node:child_process";
import { join } from "node:path";

/**
 * Everything here shells out to `startappimage`, the bash CLI that ships in `assets/`.
 *
 * It is vendored verbatim from the upstream Omarchy plugin (MIT), because it is the
 * measured half of that project. Keeping it as the
 * only implementation means the rules for adopting an existing launcher entry, parsing
 * an `Exec=` line or deleting what an install created are written once, and covered by
 * the plugin's own 55 checks.
 *
 * Nothing here imports `@vicinae/api`, so the tests can run it headless.
 */

export type SourceKind = "github" | "url" | "local" | "external";

/** One row of `list --json`. */
export type AppImageApp = {
  id: string;
  name: string;
  source: string;
  sourceKind: SourceKind;
  repo: string;
  version: string;
  /** A path to a png/svg, or "" when the app has no icon. */
  icon: string;
  exec: string;
  external: boolean;
};

/** One app's `config` — what the settings form edits. */
export type AppImageSettings = {
  id: string;
  name: string;
  path: string;
  dir: string;
  /** Launch arguments as they sit in the launcher entry, field codes removed. */
  args: string;
  source: string;
  sourceKind: SourceKind;
  repo: string;
  version: string;
  hidden: boolean;
  external: boolean;
};

export type InstallLocation = { path: string; apps: number };

export type Locations = { default: string; options: InstallLocation[] };

/** What `add --json`, `set --json` and `remove --json` answer. */
export type Outcome = { ok: true; id?: string; name?: string } | { ok: false; field: string; error: string };

export type Update = { id: string; current: string; latest: string };

/** What `resolve` answers about a GitHub update source. */
export type Resolved = {
  ok: boolean;
  repo: string;
  tag: string;
  asset: string;
  /** `invalid`, `notfound`, `noasset`, `network`, or "" when ok. */
  kind: string;
  error: string;
};

/** The installed copy of the CLI. `environment.assetsPath` is the caller's business. */
export function cliPath(assetsPath: string): string {
  return join(assetsPath, "startappimage");
}

function run(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ out: string; err: string; code: number }> {
  return new Promise((resolve) => {
    // bash, not exec of the file itself: the script ships without a guaranteed exec bit
    // once it has been copied through a build cache.
    execFile("bash", [script, ...args], { env, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof error.code === "number" ? error.code : error ? 1 : 0;
      resolve({ out: stdout, err: stderr, code });
    });
  });
}

/**
 * Runs a command that answers JSON.
 *
 * A failure is JSON too: `add --json` and `set --json` print `{ok:false, field, error}` on
 * stdout and exit 1, so a non-zero exit must not throw before that is read.
 */
async function runJson<T>(script: string, args: string[], env?: NodeJS.ProcessEnv): Promise<T> {
  const { out, err } = await run(script, args, env);
  try {
    return JSON.parse(out) as T;
  } catch {
    throw new Error(err.trim() || `startappimage ${args[0] ?? ""} printed no JSON`);
  }
}

export function listApps(script: string, env?: NodeJS.ProcessEnv): Promise<AppImageApp[]> {
  return runJson<AppImageApp[]>(script, ["list", "--json"], env);
}

export function appSettings(script: string, id: string, env?: NodeJS.ProcessEnv): Promise<AppImageSettings> {
  return runJson<AppImageSettings>(script, ["config", id], env);
}

export function installLocations(script: string, env?: NodeJS.ProcessEnv): Promise<Locations> {
  return runJson<Locations>(script, ["locations"], env);
}

export function checkUpdates(script: string, env?: NodeJS.ProcessEnv): Promise<Update[]> {
  return runJson<Update[]>(script, ["check", "--json"], env);
}

export function resolveSource(script: string, link: string, env?: NodeJS.ProcessEnv): Promise<Resolved> {
  return runJson<Resolved>(script, ["resolve", link], env);
}

export function installApp(
  script: string,
  source: string,
  options: { name?: string; dir?: string } = {},
  env?: NodeJS.ProcessEnv,
): Promise<Outcome> {
  const args = ["add", source, ...(options.name ? [options.name] : []), ...(options.dir ? ["--dir", options.dir] : []), "--json"];
  return runJson<Outcome>(script, args, env);
}

export type SettingsPatch = {
  name: string;
  /** Only when the folder changes: `set --dir` refuses any folder outside the home, and an
   * app another launcher put in `/opt` would then fail to save its name. */
  dir?: string;
  args: string;
  source: string;
  hidden: boolean;
};

export function saveSettings(script: string, id: string, patch: SettingsPatch, env?: NodeJS.ProcessEnv): Promise<Outcome> {
  const args = [
    "set",
    id,
    "--name",
    patch.name,
    ...(patch.dir ? ["--dir", patch.dir] : []),
    "--args",
    patch.args,
    "--source",
    patch.source,
    "--hidden",
    String(patch.hidden),
    "--json",
  ];
  return runJson<Outcome>(script, args, env);
}

export function uninstallApp(script: string, id: string, env?: NodeJS.ProcessEnv): Promise<Outcome> {
  return runJson<Outcome>(script, ["remove", id, "--json"], env);
}

/** `update` prints progress rather than JSON; it answers nothing and fails loudly. */
export async function updateApps(script: string, id?: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const { out, err, code } = await run(script, ["update", ...(id ? [id] : [])], env);
  if (code !== 0) throw new Error(err.trim() || `startappimage update failed with exit ${code}`);
  return out.trim();
}

/**
 * Starts an installed app through the CLI's `run`, which execs the AppImage.
 *
 * `detached` + `unref`: the extension worker is torn down seconds after the command returns,
 * and the app has to outlive it.
 */
export function runApp(script: string, id: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [script, "run", id], { detached: true, stdio: "ignore", env });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** The row subtitle: where this app came from, in the words the UI uses. */
export function describeSource(app: { sourceKind: SourceKind; repo: string }): string {
  switch (app.sourceKind) {
    case "github":
      return app.repo ? `GitHub · ${app.repo}` : "GitHub";
    case "url":
      return "Downloaded from a URL";
    case "external":
      return "Added by another launcher";
    default:
      return "Local file";
  }
}
