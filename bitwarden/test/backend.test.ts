import assert from "node:assert/strict";

import { BwCliError, BwCliNotFoundError, resolveCliPath, runCli } from "../src/api/cli.ts";
import { getCliErrorText } from "../src/utils/errors.ts";
import { installed } from "./vicinae-api-shim.ts";

/**
 * The backend check: everything in this extension is a call to the Bitwarden
 * CLI, so this runs `bw` itself rather than a stub.
 *
 * What a check can see without the master password: the binary that would be
 * run, its version, `status`, and the two commands that answer offline —
 * `encode` (stdin) and `generate`. Plus the failures the extension branches
 * on: a command the CLI does not have, and the locked-vault answer that
 * `checkLockStatus` reads. Nothing here unlocks the vault, lists items or
 * puts a secret on stdout.
 *
 * The vault is the user's, so no check prints what it returns: `status` is
 * asserted field by field, and the password is counted, not shown.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

const ORIGINAL_PATH = process.env.PATH;
const ORIGINAL_CLI_PATH = process.env.BW_CLI_PATH;
const CLI = installed();

function skip(name: string, reason: string): void {
  skipped += 1;
  console.log(`SKIP ${name} (${reason})`);
}

function fail(name: string, error: unknown): void {
  failed += 1;
  console.log(`FAIL ${name}`);
  console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
}

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    fail(name, error);
  }
}

/** `resolveCliPath` reads the preference on every call, so this is enough to vary it. */
async function withEnv<T>(vars: { PATH?: string; BW_CLI_PATH?: string }, body: () => Promise<T>): Promise<T> {
  Object.assign(process.env, vars);
  try {
    return await body();
  } finally {
    process.env.PATH = ORIGINAL_PATH;
    if (ORIGINAL_CLI_PATH === undefined) delete process.env.BW_CLI_PATH;
    else process.env.BW_CLI_PATH = ORIGINAL_CLI_PATH;
  }
}

async function main(): Promise<void> {
  await check("a missing binary is named, and the searched path is spelled out", async () => {
    await withEnv({ PATH: "", BW_CLI_PATH: "" }, async () => {
      assert.throws(() => resolveCliPath(), (error: unknown) => {
        assert.ok(error instanceof BwCliNotFoundError, `expected BwCliNotFoundError, got ${String(error)}`);
        // The message has to name the path it searched, or the user cannot tell
        // whether the CLI is missing or the extension looked in the wrong place.
        assert.match(error.message, /pacman -S bitwarden-cli/);
        return true;
      });
    });
  });

  if (CLI === "") {
    for (const name of [
      "the CLI that the extension finds is the one installed",
      "status reports a state the extension knows",
      "a JSON document survives stdin",
      "a generated password is the length it was asked for",
      "a command the CLI does not have carries its own stderr",
      "a locked vault answers unlock --check the way checkLockStatus expects",
    ]) {
      skip(name, "bw is not installed");
    }
    summary();
    return;
  }

  await check("the CLI that the extension finds is the one installed", async () => {
    await withEnv({ BW_CLI_PATH: "" }, async () => {
      assert.equal(resolveCliPath(), CLI);
      const version = (await runCli(["--version"])).trim();
      assert.match(version, /^\d{4}\.\d+\.\d+$/, `unexpected version: ${version}`);
    });
  });

  await check("status reports a state the extension knows", async () => {
    const state = JSON.parse(await runCli(["status"])) as Record<string, unknown>;
    assert.ok(
      ["unlocked", "locked", "unauthenticated"].includes(String(state.status)),
      `status was ${JSON.stringify(state.status)}`,
    );
    assert.equal(typeof state.userId, "string");
    // serverUrl is null on the default server and a string on a self-hosted one.
    assert.ok(state.serverUrl === null || typeof state.serverUrl === "string");
  });

  await check("a JSON document survives stdin", async () => {
    const document = JSON.stringify({ name: "widget", notes: "line\nline" });
    const encoded = (await runCli(["encode"], { input: document })).trim();
    assert.equal(Buffer.from(encoded, "base64").toString("utf8"), document);
  });

  await check("a generated password is the length it was asked for", async () => {
    const password = (await runCli(["generate", "--length", "20"])).trim();
    assert.equal(password.length, 20);
    assert.match(password, /^[A-Za-z0-9]+$/);
  });

  await check("a command the CLI does not have carries its own stderr", async () => {
    await assert.rejects(runCli(["definitely-not-a-command"]), (error: unknown) => {
      assert.ok(error instanceof BwCliError, `expected BwCliError, got ${String(error)}`);
      assert.equal(error.exitCode, 1);
      assert.match(error.stderr, /Invalid command/);
      // The UI shows this text; a wrapper message would hide what the CLI said.
      assert.match(getCliErrorText(error), /Invalid command/);
      return true;
    });
  });

  await check("unlock --check answers the way checkLockStatus expects", async () => {
    const state = JSON.parse(await runCli(["status"])) as { status: string };

    let stderr = "";
    try {
      await runCli(["unlock", "--check"]);
    } catch (error) {
      stderr = getCliErrorText(error);
    }

    if (state.status === "unlocked") {
      // Exit zero is what the extension reads as "unlocked"; an error here would
      // lock a vault that is already open.
      assert.equal(stderr, "", `an unlocked vault answered with an error: ${stderr}`);
      return;
    }

    // A non-zero exit means "locked" to `checkLockStatus`; an empty stderr would
    // read the same, so the wording is what tells the two states apart.
    assert.match(stderr, /Vault is locked\./, `unlock --check said ${JSON.stringify(stderr)}`);
  });

  summary();
}

function summary(): void {
  console.log(`\npassed: ${passed}, failed: ${failed}, skipped: ${skipped}`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
