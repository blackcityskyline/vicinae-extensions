import assert from "node:assert/strict";

import { addJob, isJob, parseCrontab, removeJob, renderCrontab, replaceJob, type CrontabLine } from "../src/utils/crontab.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
  try {
    body();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${(error as Error).message.split("\n").slice(0, 8).join("\n     ")}`);
  }
}

/** The job at a line index, or a failure naming the line. */
function jobAt(text: string, index: number) {
  const line: CrontabLine | undefined = parseCrontab(text)[index];
  if (!isJob(line)) throw new Error(`line ${index} of ${JSON.stringify(text)} is not a job`);
  return line;
}

const REAL = [
  "# my crontab, keep the comment",
  "SHELL=/bin/bash",
  "PATH=/usr/local/bin:/usr/bin",
  "",
  'MAILTO=""',
  "*/5 * * * * /usr/bin/true --probe",
  "@daily /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1",
  "0 9 * * 1-5 /usr/bin/systemctl is-active nginx",
].join("\n");

check("comments, blank lines and assignments are carried through untouched", () => {
  const lines = parseCrontab(REAL);
  assert.deepEqual(
    lines.map((line) => line.kind),
    ["passthrough", "passthrough", "passthrough", "passthrough", "passthrough", "job", "job", "job"],
  );
});

check("a five-field line is split into schedule and command", () => {
  const job = jobAt("*/5 * * * * /usr/bin/true --probe", 0);
  assert.equal(job.schedule, "*/5 * * * *");
  assert.equal(job.command, "/usr/bin/true --probe");
});

check("an alias schedule is one field, not five", () => {
  const job = jobAt("@daily /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1", 0);
  assert.equal(job.schedule, "@daily");
  assert.equal(job.command, "/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1");
});

check("tabs separate fields as well as spaces", () => {
  const job = jobAt("0\t3\t*\t*\t*\t/bin/thing", 0);
  assert.equal(job.schedule, "0 3 * * *");
  assert.equal(job.command, "/bin/thing");
});

check("a hash inside a command is not a comment", () => {
  assert.equal(jobAt("0 0 * * * echo #1", 0).command, "echo #1");
});

check("rendering a parsed crontab returns it unchanged", () => {
  assert.equal(renderCrontab(parseCrontab(REAL)), `${REAL}\n`);
});

check("an empty crontab renders to nothing at all", () => {
  assert.equal(renderCrontab(parseCrontab("")), "");
});

// removeJob and replaceJob take a line index, not a job index, so that lines
// nobody touched can be written back byte for byte. In REAL the three jobs are
// the lines at 5, 6 and 7.
//
// The whole point of keeping lines instead of parsed jobs: a line the parser
// does not understand must never be rewritten, because writing it back is how
// jobs get lost.

check("a line with too few fields is passed through rather than guessed at", () => {
  const lines = parseCrontab("* * * *\n0 0 * * * /bin/ok");
  assert.equal(lines[0]?.kind, "passthrough");
  assert.equal(lines[1]?.kind, "job");
});

check("a non-schedule first word is passed through", () => {
  const job = jobAt("@every_minute /bin/thing", 0);
  assert.equal(job.schedule, "@every_minute");
});

check("removing a job leaves everything else exactly where it was", () => {
  const before = parseCrontab(REAL);
  const after = removeJob(before, 5);
  assert.equal(renderCrontab(after), renderCrontab(before).replace("*/5 * * * * /usr/bin/true --probe\n", ""));
});

check("removing the last job leaves the comments and assignments", () => {
  const text = renderCrontab(removeJob(parseCrontab(REAL), 7));
  assert.ok(text.includes("# my crontab, keep the comment"));
  assert.ok(text.includes('MAILTO=""'));
  assert.ok(!text.includes("systemctl is-active nginx"));
});

check("replacing a job swaps only that line", () => {
  const text = renderCrontab(replaceJob(parseCrontab(REAL), 5, "0 * * * *", "/bin/other"));
  assert.ok(text.includes("0 * * * * /bin/other"));
  assert.ok(!text.includes("/usr/bin/true --probe"));
  assert.ok(text.includes("@daily /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1"));
});

check("adding a job appends it below the existing ones", () => {
  assert.ok(renderCrontab(addJob(parseCrontab(REAL), "*/2 * * * *", "/bin/new")).endsWith("*/2 * * * * /bin/new\n"));
});

check("an empty crontab can still take a job", () => {
  assert.equal(renderCrontab(addJob(parseCrontab(""), "0 4 * * *", "/bin/x")), "0 4 * * * /bin/x\n");
});

check("repeated saves do not accumulate blank lines", () => {
  // `crontab -l` output ends in a newline; taking it as an empty line would add
  // one more blank line to the crontab on every single save.
  let lines = parseCrontab("*/5 * * * * /bin/a\n");
  for (let round = 0; round < 3; round += 1) lines = addJob(lines, "0 * * * *", "/bin/b");
  assert.equal(renderCrontab(lines), "*/5 * * * * /bin/a\n0 * * * * /bin/b\n0 * * * * /bin/b\n0 * * * * /bin/b\n");
});

check("a line that only looks like a job keeps its exact bytes", () => {
  const odd = "weird\tline  with   spaces\tin it";
  const lines: CrontabLine[] = parseCrontab(odd);
  assert.equal(renderCrontab(lines), `${odd}\n`);
});

console.log(failed === 0 ? `\nall ${passed} checks passed` : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
