import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readCrontab, updateCrontab } from "../src/api/crontab.ts";
import { addJob, isJob, parseCrontab, removeJob } from "../src/utils/crontab.ts";

/**
 * The backend check: the extension talks to the real `crontab` command, so this
 * test drives that command rather than a stub. The user's crontab is snapshotted
 * first and put back in a `finally`, including on Ctrl-C, because the jobs added
 * here go into the same spool the user's cron reads.
 *
 * What it proves: a job created through the extension's own code lands in the
 * system crontab, cron accepts the schedule, and the job is gone again after
 * removeJob. What it cannot prove without a running daemon: that cron fires it.
 * That last check runs only when crond is active and says SKIP otherwise.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(name: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

function skip(name: string, reason: string): void {
  skipped += 1;
  console.log(`SKIP ${name} (${reason})`);
}

function rawCrontab(): string {
  const result = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return result.stdout;
  if (/no crontab for/i.test(result.stderr)) return "";
  throw new Error(`crontab -l failed: ${result.stderr.trim() || result.status}`);
}

function restore(text: string): void {
  const result =
    text.trim() === ""
      ? spawnSync("crontab", ["-r"], { encoding: "utf8" })
      : spawnSync("crontab", ["-"], { encoding: "utf8", input: text });
  if (result.status !== 0) {
    console.error(`could not restore the crontab: ${result.stderr.trim() || result.status}`);
  }
}

function crondActive(): boolean {
  const result = spawnSync("systemctl", ["is-active", "crond"], { encoding: "utf8" });
  return result.stdout.trim() === "active";
}

async function main(): Promise<void> {
  if (spawnSync("crontab", ["-l"]).error) {
    skip("the real crontab backend", "the crontab command is not installed");
    console.log("\n0 checks passed, 1 skipped");
    return;
  }

const marker = `vicinae-cron-kit-${process.pid}`;
const scratch = mkdtempSync(join(tmpdir(), "cron-kit-backend-"));
const fired = join(scratch, "fired");

const before = rawCrontab();
const restoreOnExit = () => restore(before);
process.once("exit", restoreOnExit);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    restore(before);
    process.exit(130);
  });
}

try {
  await check("the extension reads the crontab the system holds", async () => {
    const read = await readCrontab();
    assert.equal(read.ok, true, read.ok ? "" : read.message);
    if (read.ok) assert.equal(read.value, before);
  });

  await check("a job added through the extension reaches the real crontab", async () => {
    const command = `true # ${marker}`;
    const written = await updateCrontab((lines) => addJob(lines, "*/5 * * * *", command));
    assert.equal(written.ok, true, written.ok ? "" : written.message);

    const onDisk = rawCrontab();
    const jobs = parseCrontab(onDisk).filter(isJob);
    const job = jobs.find((line) => line.command === command);
    assert.ok(job, `no job with ${JSON.stringify(command)} in ${JSON.stringify(onDisk)}`);
    assert.equal(job.schedule, "*/5 * * * *");
  });

  await check("cron itself parsed the schedule instead of us guessing", async () => {
    // `crontab -` exits non-zero when the daemon's parser rejects a line, so a
    // schedule that only our own parser accepted would have failed above.
    const probe = spawnSync("crontab", ["-"], { encoding: "utf8", input: `*/5 * * * * true # ${marker}\n` });
    assert.equal(probe.status, 0, probe.stderr.trim());
    restore(rawCrontab());
  });

  await check("a job removed through the extension leaves the crontab as it was", async () => {
    const command = `true # ${marker}`;
    const removed = await updateCrontab((lines) => {
      const index = lines.findIndex((line) => isJob(line) && line.command === command);
      assert.notEqual(index, -1, "the job to remove is missing");
      return removeJob(lines, index);
    });
    assert.equal(removed.ok, true, removed.ok ? "" : removed.message);
    assert.equal(rawCrontab(), before);
  });

  if (!crondActive()) {
    skip("cron runs the job it was given", "crond is not active");
  } else {
    await check("cron runs the job it was given", async () => {
      const command = `date +%s > ${fired} # ${marker}`;
      const written = await updateCrontab((lines) => addJob(lines, "* * * * *", command));
      assert.equal(written.ok, true, written.ok ? "" : written.message);

      const deadline = Date.now() + 80_000;
      while (Date.now() < deadline && !existsSync(fired)) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      assert.ok(existsSync(fired), "cron did not run the job within 80s");
      assert.match(readFileSync(fired, "utf8").trim(), /^\d+$/);
    });
  }
} finally {
  process.removeListener("exit", restoreOnExit);
  restore(before);
  rmSync(scratch, { recursive: true, force: true });
  const after = rawCrontab();
  console.log(
    after === before ? "\ncrontab restored unchanged" : `\ncrontab DIFFERS from the snapshot:\n${after}`,
  );
  if (after !== before) failed += 1;
}

console.log(
  failed === 0
    ? `\nall ${passed} checks passed${skipped ? `, ${skipped} skipped` : ""}`
    : `\n${failed} check(s) failed`,
);
process.exit(failed === 0 ? 0 : 1);
}

void main();
