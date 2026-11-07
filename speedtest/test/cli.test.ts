import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyCli, findExecutable } from "../src/api/cli.ts";

let checks = 0;
function check(name: string, body: () => void) {
	try {
		body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

check("findExecutable finds an executable in PATH", () => {
	const dir = mkdtempSync(join(tmpdir(), "st-"));
	const file = join(dir, "foo");
	writeFileSync(file, "#!/bin/sh\n");
	chmodSync(file, 0o755);
	try {
		assert.equal(findExecutable("foo", dir, tmpdir()), file);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

check("findExecutable rejects a non-executable file", () => {
	const dir = mkdtempSync(join(tmpdir(), "st-"));
	const file = join(dir, "bar");
	writeFileSync(file, "x");
	chmodSync(file, 0o644);
	try {
		assert.equal(findExecutable("bar", dir, tmpdir()), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

check("findExecutable returns null for a missing name", () => {
	const dir = mkdtempSync(join(tmpdir(), "st-"));
	try {
		assert.equal(findExecutable("nope", dir, tmpdir()), null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

check("findExecutable expands a leading ~/ path", () => {
	const home = mkdtempSync(join(tmpdir(), "home-"));
	const bin = join(home, "bin");
	mkdirSync(bin);
	const file = join(bin, "tool");
	writeFileSync(file, "x");
	chmodSync(file, 0o755);
	try {
		assert.equal(findExecutable("~/bin/tool", "", home), file);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

check("findExecutable falls back to ~/.local/bin/speedtest", () => {
	const home = mkdtempSync(join(tmpdir(), "home-"));
	const bin = join(home, ".local", "bin");
	mkdirSync(bin, { recursive: true });
	const file = join(bin, "speedtest");
	writeFileSync(file, "x");
	chmodSync(file, 0o755);
	try {
		assert.equal(findExecutable("speedtest", "", home), file);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

check("classifyCli detects speedtest-cli version", () => {
	assert.equal(classifyCli("speedtest-cli 2.1.3", ""), "python");
});

check("classifyCli detects Ookla version", () => {
	assert.equal(classifyCli("Speedtest by Ookla 1.2.0.84", ""), "ookla");
});

check("classifyCli detects Ookla help flag", () => {
	assert.equal(classifyCli("", "x --progress-update-interval y"), "ookla");
});

check("classifyCli detects python help flags", () => {
	assert.equal(classifyCli("", "--json --secure"), "python");
});

check("classifyCli returns null for unknown", () => {
	assert.equal(classifyCli("foo", "bar"), null);
});

console.log(`${checks} checks passed`);
