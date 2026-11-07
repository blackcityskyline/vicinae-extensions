import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runSpeedtest } from "../src/api/cli.ts";

let checks = 0;

async function check(name: string, body: () => Promise<void>) {
	try {
		await body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

async function main() {
	await check("a non-zero exit code fails even with a result", async () => {
		const dir = mkdtempSync(join(tmpdir(), "st-"));
		try {
			const file = join(dir, "speedtest");
			writeFileSync(
				file,
				'#!/bin/sh\nprintf \'%s\\n\' \'{"type":"result","download":{"bandwidth":1000000},"upload":{"bandwidth":2000000}}\'\nexit 1\n',
			);
			chmodSync(file, 0o755);
			const outcome = await runSpeedtest(
				{ path: file, kind: "ookla" },
				() => {},
				new AbortController().signal,
			);
			assert.equal(outcome.ok, false);
			if (!outcome.ok) assert.ok(outcome.error.length > 0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("a zero exit code yields the parsed result", async () => {
		const dir = mkdtempSync(join(tmpdir(), "st-"));
		try {
			const file = join(dir, "speedtest");
			writeFileSync(
				file,
				'#!/bin/sh\nprintf \'%s\\n\' \'{"type":"result","download":{"bandwidth":1000000},"upload":{"bandwidth":2000000}}\'\nexit 0\n',
			);
			chmodSync(file, 0o755);
			const outcome = await runSpeedtest(
				{ path: file, kind: "ookla" },
				() => {},
				new AbortController().signal,
			);
			assert.equal(outcome.ok, true);
			if (outcome.ok) {
				assert.equal(outcome.state.downloadMbps, 8);
				assert.equal(outcome.state.uploadMbps, 16);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	console.log(`${checks} checks passed`);
}

void main();
