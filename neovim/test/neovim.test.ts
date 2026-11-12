import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { parseKeymaps } from "../src/lib/keymaps.ts";
import { ago, shortHome } from "../src/lib/paths.ts";
import { browserUrl, originOf, readLock, shortCommit } from "../src/lib/plugins.ts";
import { decodeSessionPath, escapeNvimPath, readSessions, sessionName } from "../src/lib/sessions.ts";

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed++;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${(error as Error).message}`);
  }
}

function skip(name: string, reason: string): void {
  skipped++;
  console.log(`SKIP ${name}: ${reason}`);
}

const SESSIONS = `${process.env.HOME}/.local/state/nvim/sessions`;
const LAZY_ROOT = `${process.env.HOME}/.local/share/nvim/lazy`;
const LOCK = `${process.env.HOME}/.config/nvim/lazy-lock.json`;

/**
 * persistence.nvim's naming, checked against Neovim itself: source a real session
 * headless and compare the `cd` it performs with the decoded directory. The
 * authority is nvim, not our decoder.
 */
async function realSessionsCheck(): Promise<void> {
  const name = "the three newest live sessions decode to the directory nvim restores";
  const sessions = readSessions(SESSIONS).filter((session) => !session.missing).slice(0, 3);
  if (sessions.length === 0) {
    skip(name, "no ~/.local/state/nvim/sessions with an existing directory");
    return;
  }

  await check(name, () => {
    for (const session of sessions) {
      const result = spawnSync(
        "nvim",
        ["--headless", "-S", escapeNvimPath(session.file), "-c", 'lua io.stderr:write("CWD=" .. vim.fn.getcwd() .. "\\n")', "-c", "qall!"],
        { encoding: "utf8" },
      );
      const cwd = /CWD=(.*)/.exec(result.stderr ?? "")?.[1];
      assert.equal(cwd, session.directory, `${session.name} restored ${cwd}`);
    }
  });
}

/** The audit found 42/42 plugins with a real origin; the parser must agree with git. */
async function realPluginsCheck(): Promise<void> {
  const name = "every installed plugin's origin becomes a browser URL";
  let plugins: string[];
  try {
    plugins = readdirSync(LAZY_ROOT);
  } catch {
    skip(name, "no ~/.local/share/nvim/lazy on this machine");
    return;
  }

  await check(name, () => {
    let checked = 0;
    for (const plugin of plugins) {
      let config: string;
      try {
        config = readFileSync(join(LAZY_ROOT, plugin, ".git", "config"), "utf8");
      } catch {
        continue;
      }
      const origin = originOf(config);
      assert.ok(origin !== undefined, `${plugin} has a git dir but no origin`);
      const url = browserUrl(origin);
      assert.ok(url !== undefined && url.startsWith("https://"), `${plugin}: ${origin} → ${url}`);
      checked++;
    }
    assert.ok(checked > 0, "no plugin remotes were checked");
    console.log(`     ${checked} remotes parsed`);
  });
}

/** The lock file is lazy.nvim's output; the reading must survive whatever it holds. */
async function realLockCheck(): Promise<void> {
  const name = "the real lazy-lock.json parses into name/branch/commit rows";
  try {
    readFileSync(LOCK, "utf8");
  } catch {
    skip(name, "no ~/.config/nvim/lazy-lock.json on this machine");
    return;
  }

  await check(name, () => {
    const lock = readLock(LOCK);
    const names = Object.keys(lock);
    assert.ok(names.length > 0, "lock file is empty");
    for (const plugin of names) {
      assert.match(lock[plugin]?.commit ?? "", /^[0-9a-f]{40}$/, `${plugin} has no 40-character commit`);
    }
  });
}

/** `nvim --headless` is the real source; nothing is faked here. */
async function liveKeymapCheck(): Promise<void> {
  const name = "nvim --headless prints a keymap table that parses";
  try {
    execFileSync("nvim", ["--version"], { stdio: "ignore" });
  } catch {
    skip(name, "nvim is not on PATH");
    return;
  }

  await check(name, () => {
    const dir = mkdtempSync(join(os.tmpdir(), "neovim-test-"));
    const script = join(dir, "dump.lua");
    writeFileSync(
      script,
      'print(vim.json.encode({ { lhs = "<leader>x", rhs = "", desc = "test" } }))\nvim.cmd("qall!")',
    );
    try {
      const result = spawnSync("nvim", ["--headless", "-S", script], { encoding: "utf8" });
      const keymaps = parseKeymaps(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
      assert.equal(keymaps[0]?.lhs, "<leader>x");
      assert.equal(keymaps[0]?.description, "test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

async function main(): Promise<void> {
  await check("a session filename turns separators back into a path", () => {
    assert.equal(decodeSessionPath("%home%black.vim"), "/home/black");
    assert.equal(decodeSessionPath("%home%black%.config%nvim.lua"), "/home/black/.config/nvim");
    assert.equal(decodeSessionPath("%home%black%dev%me%vicinae-extensions.vim"), "/home/black/dev/me/vicinae-extensions");
  });

  await check("a doubled percent stays a literal percent", () => {
    assert.equal(decodeSessionPath("%home%black%%tmp.vim"), "/home/black%tmp");
    assert.equal(decodeSessionPath("%home%a%%b%%c.vim"), "/home/a%b%c");
    assert.equal(decodeSessionPath("%etc%systemd.vim"), "/etc/systemd");
  });

  await check("an unsaved root or a bare name still gets a row title", () => {
    assert.equal(sessionName("/home/black/dev"), "dev");
    assert.equal(sessionName("/"), "/");
    assert.equal(sessionName(decodeSessionPath("%.vim")), "/");
  });

  await check("a session path is escaped so nvim sources it instead of reading % as the buffer", () => {
    assert.equal(
      escapeNvimPath("/home/black/.local/state/nvim/sessions/%home%black.vim"),
      "/home/black/.local/state/nvim/sessions/\\%home\\%black.vim",
    );
    assert.equal(escapeNvimPath("/plain/path.vim"), "/plain/path.vim");
    assert.equal(escapeNvimPath("/a b/c#d.vim"), "/a\\ b/c\\#d.vim");
  });

  await check("sessions are read newest first, and only .vim/.lua files", () => {
    const sessions = readSessions(SESSIONS);
    if (sessions.length === 0) {
      assert.deepEqual(sessions, []);
      return;
    }
    for (let index = 1; index < sessions.length; index++) {
      const previous = sessions[index - 1]?.modified.getTime() ?? 0;
      assert.ok(previous >= (sessions[index]?.modified.getTime() ?? 0), "sessions are not sorted newest first");
    }
    assert.ok(sessions.every((session) => /\.(vim|lua)$/.test(session.file)));
  });

  await check("a missing sessions directory is an empty list, not an error", () => {
    assert.deepEqual(readSessions("/nonexistent/nvim/sessions"), []);
  });

  await check("a bad lock file is empty, not a crash", () => {
    assert.deepEqual(readLock("/nonexistent/lazy-lock.json"), {});
  });

  await check("remotes from a real git config become https URLs, a .git suffix dropped", () => {
    assert.equal(browserUrl("https://github.com/lewis6991/gitsigns.nvim.git"), "https://github.com/lewis6991/gitsigns.nvim");
    assert.equal(browserUrl("git@github.com:saghen/blink.cmp.git"), "https://github.com/saghen/blink.cmp");
    assert.equal(browserUrl("ssh://git@example.org/owner/repo.git"), "https://example.org/owner/repo");
    assert.equal(browserUrl("https://gitlab.com/a/b"), "https://gitlab.com/a/b");
  });

  await check("a plugin without an origin has no link, and one with an origin is read from its section", () => {
    assert.equal(originOf('[core]\n\trepositoryformatversion = 0\n'), undefined);
    assert.equal(
      originOf('[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:a/b.git\n\tfetch = +refs/heads/*\n[branch "main"]\n\tremote = origin\n'),
      "git@github.com:a/b.git",
    );
  });

  await check("the commit shown is seven characters", () => {
    assert.equal(shortCommit("c10948c50b18fae7f256433afdef09e432410480"), "c10948c");
    assert.equal(shortCommit("abc"), "abc");
  });

  await check("the keymap parse takes the payload, not a notice that starts with a bracket", () => {
    const stream = '[notice] something happened\n[{"lhs":" f","rhs":"","desc":"Find files"}]\n';
    const keymaps = parseKeymaps(stream);
    assert.equal(keymaps.length, 1);
    assert.equal(keymaps[0]?.lhs, " f");
    assert.equal(keymaps[0]?.description, "Find files");
  });

  await check("a keymap with no description falls back to its rhs", () => {
    const keymaps = parseKeymaps('[{"lhs":"Q","rhs":":qa!<CR>","desc":""}]');
    assert.equal(keymaps[0]?.description, ":qa!<CR>");
  });

  await check("no keymap table is an error, not an empty list", () => {
    assert.throws(() => parseKeymaps("E5108: Error executing lua"), /no keymap table/);
    assert.throws(() => parseKeymaps('[{"lhs":"x"'), /no keymap table/);
  });

  await check("a home path is shortened for display, and nothing else is", () => {
    const home = process.env.HOME ?? "";
    assert.equal(shortHome(home), "~");
    assert.equal(shortHome(`${home}/dev/me`), "~/dev/me");
    assert.equal(shortHome("/etc/systemd"), "/etc/systemd");
  });

  await check("a timestamp reads in words at the precision a list needs", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    assert.equal(ago(new Date("2026-11-12T11:59:40Z"), now), "just now");
    assert.equal(ago(new Date("2026-11-12T11:30:00Z"), now), "30 minutes ago");
    assert.equal(ago(new Date("2026-11-12T09:00:00Z"), now), "3 hours ago");
    assert.equal(ago(new Date("2026-11-09T12:00:00Z"), now), "3 days ago");
  });

  await realSessionsCheck();
  await realPluginsCheck();
  await realLockCheck();
  await liveKeymapCheck();

  console.log(failed === 0 ? `\n${passed} passed, ${skipped} skipped` : `\n${failed} check(s) failed, ${skipped} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
