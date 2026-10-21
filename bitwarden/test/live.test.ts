import assert from "node:assert/strict";

import { Bitwarden } from "../src/api/bitwarden.ts";
import type { Item } from "../src/types/vault.ts";

/**
 * The live check: the extension's own code against the real CLI, the real
 * account and the real server.
 *
 * Opt-in, because it needs the master password and it unlocks the vault:
 *
 *     BW_PASSWORD='...' npm run test:live
 *
 * The password is read from the environment and never printed. Nothing is
 * written to the vault — the extension has no delete, so anything created here
 * would stay in it; the checks are the read side plus the lock/unlock state
 * machine. The vault is locked again in `finally`, whether the checks pass or
 * not, because it was locked when the run started.
 *
 * Item contents are never printed: counts and field types only.
 */

const PASSWORD = process.env.BW_PASSWORD ?? "";

let passed = 0;
let failed = 0;
let skipped = 0;

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

async function main(): Promise<void> {
  if (PASSWORD === "") {
    for (const name of [
      "the version comes back from the CLI",
      "the account is a known state",
      "the vault unlocks with the master password",
      "the vault syncs from the server",
      "items list and read back",
      "folders list",
      "a TOTP code is generated",
      "a password is generated",
      "the vault locks again",
    ]) {
      skip(name, "BW_PASSWORD is not set");
    }
    summary();
    return;
  }

  const vault = new Bitwarden();
  await vault.initialize();
  let unlocked = false;

  try {
    await check("the version comes back from the CLI", async () => {
      const { result, error } = await vault.getVersion();
      assert.equal(error, undefined, `getVersion failed: ${error?.message}`);
      assert.match(result ?? "", /^\d{4}\.\d+\.\d+$/);
    });

    await check("the account is a known state", async () => {
      const { result, error } = await vault.status();
      assert.equal(error, undefined, `status failed: ${error?.message}`);
      assert.ok(result, "status returned nothing");
      assert.ok(["locked", "unlocked", "unauthenticated"].includes(result.status), `status was ${result.status}`);
      assert.ok(result.userEmail === null || typeof result.userEmail === "string");
      assert.notEqual(result.status, "unauthenticated", "the extension's data dir has no logged-in account");
    });

    await check("the vault unlocks with the master password", async () => {
      const { result, error } = await vault.unlock(PASSWORD);
      assert.equal(error, undefined, `unlock failed: ${error?.message}`);
      assert.ok((result ?? "").length > 0, "unlock returned an empty session token");
      unlocked = true;

      const after = await vault.status();
      assert.equal(after.error, undefined, `status after unlock failed: ${after.error?.message}`);
      assert.equal(after.result?.status, "unlocked");
    });

    await check("the vault syncs from the server", async () => {
      const { error } = await vault.sync();
      assert.equal(error, undefined, `sync failed: ${error?.message}`);
    });

    let items: Item[] = [];
    await check("items list and read back", async () => {
      const { result, error } = await vault.listItems();
      assert.equal(error, undefined, `listItems failed: ${error?.message}`);
      items = result ?? [];
      assert.ok(items.length > 0, "the vault listed no items at all");

      for (const item of items) {
        assert.ok(item.id, "an item came back without an id");
        assert.ok(item.name, "an item came back without a name");
        assert.equal(typeof item.type, "number");
      }

      // One item is fetched on its own: the list and the single read are
      // different CLI calls, and the detail view uses the second.
      const { result: one, error: oneError } = await vault.getItem(items[0]!.id);
      assert.equal(oneError, undefined, `getItem failed: ${oneError?.message}`);
      assert.equal(one?.id, items[0]!.id);
      console.log(`     ${items.length} items, ${items.filter((item) => item.login?.password).length} with a password`);
    });

    await check("folders list", async () => {
      const { result, error } = await vault.listFolders();
      assert.equal(error, undefined, `listFolders failed: ${error?.message}`);
      assert.ok(Array.isArray(result), "folders came back as something other than a list");
      console.log(`     ${result.length} folders`);
    });

    const totpItem = items.find((item) => item.login?.totp);
    if (!totpItem) {
      skip("a TOTP code is generated", "no item in the vault carries a TOTP secret");
    } else {
      await check("a TOTP code is generated", async () => {
        const { result, error } = await vault.getTotp(totpItem.id);
        assert.equal(error, undefined, `getTotp failed: ${error?.message}`);
        assert.match(result ?? "", /^\d{6,8}$/, "the code is not six to eight digits");
      });
    }

    await check("a password is generated", async () => {
      const password = await vault.generatePassword();
      assert.ok(password.length > 0, "generate returned nothing");
      assert.ok(!/\s/.test(password), "the generated password contains whitespace");
    });

    await check("the vault locks again", async () => {
      const { error } = await vault.lock();
      assert.equal(error, undefined, `lock failed: ${error?.message}`);
      unlocked = false;

      const status = await vault.checkLockStatus();
      assert.equal(status, "locked");
    });
  } finally {
    if (unlocked) {
      // The vault was locked when the run started; leaving it open would hand a
      // live session token to every later command.
      const { error } = await vault.lock();
      if (error) console.log(`     could not lock the vault afterwards: ${error.message}`);
    }
  }

  summary();
}

function summary(): void {
  console.log(`\npassed: ${passed}, failed: ${failed}, skipped: ${skipped}`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
