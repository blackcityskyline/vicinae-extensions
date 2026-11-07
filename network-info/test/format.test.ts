import assert from "node:assert/strict";

import {
	formatBytes,
	formatPing,
	formatRate,
	formatRateCompact,
	prefixToNetmask,
} from "../src/utils/format.ts";
import { sanitizeText } from "../src/utils/text.ts";

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

check("bytes below a kibibyte stay whole", () => {
	assert.equal(formatBytes(512), "512 B");
	assert.equal(formatBytes(0), "0 B");
});

check("bytes promote at 1023.5, not at 1024", () => {
	// Upstream's PROMOTE_AT: a value that rounds to 1024 is shown in the next
	// unit instead, so the reader never sees "1024 KB".
	assert.equal(formatBytes(1023.4 * 1024), "1023 KB");
	assert.equal(formatBytes(1023.5 * 1024), "1.0 MB");
	assert.equal(formatBytes(2048), "2.0 KB");
	assert.equal(formatBytes(5 * 1024 * 1024 * 1024), "5.0 GB");
});

check("a negative or absent byte count reads as zero", () => {
	assert.equal(formatBytes(-5), "0 B");
	assert.equal(formatBytes(Number.NaN), "0 B");
});

check("rates carry a unit and one decimal below ten", () => {
	assert.equal(formatRate(0), "0.0 KB/s");
	assert.equal(formatRateCompact(0), "0.0K");
	assert.equal(formatRate(2.5 * 1024 * 1024), "2.5 MB/s");
	assert.equal(formatRateCompact(2.5 * 1024 * 1024), "2.5M");
	assert.equal(formatRateCompact(10 * 1024), "10K");
});

check("a rate promotes at the same threshold as bytes", () => {
	assert.equal(formatRate(1023.5 * 1024), "1.0 MB/s");
	assert.equal(formatRateCompact(1023.4 * 1024), "1023K");
});

check("ping below a millisecond is not rounded to zero", () => {
	assert.equal(formatPing(0.4), "<1 ms");
	assert.equal(formatPing(1), "1.0 ms");
	assert.equal(formatPing(3.45), "3.5 ms");
	assert.equal(formatPing(24.7), "25 ms");
});

check("an absent or negative ping is a dash, not a number", () => {
	assert.equal(formatPing(undefined), "—");
	assert.equal(formatPing(null), "—");
	assert.equal(formatPing(-1), "—");
	assert.equal(formatPing(Number.NaN), "—");
});

check("a prefix becomes its dotted mask", () => {
	assert.equal(prefixToNetmask(24), "255.255.255.0");
	assert.equal(prefixToNetmask(0), "0.0.0.0");
	assert.equal(prefixToNetmask(32), "255.255.255.255");
	assert.equal(prefixToNetmask("24"), "255.255.255.0");
});

check("a prefix outside IPv4 is no mask", () => {
	assert.equal(prefixToNetmask(33), "");
	assert.equal(prefixToNetmask(-1), "");
	assert.equal(prefixToNetmask(""), "");
	assert.equal(prefixToNetmask(Number.NaN), "");
});

check("control characters never reach the pane", () => {
	assert.equal(sanitizeText("hello\x00world\n", 20), "helloworld");
	assert.equal(sanitizeText("a\x1b[31mb", 20), "a[31mb");
});

check("text is truncated, and absent text is empty", () => {
	assert.equal(sanitizeText("abcdef", 3), "abc");
	assert.equal(sanitizeText(null), "");
	assert.equal(sanitizeText(undefined), "");
});

check("non-ASCII data survives sanitising", () => {
	// An SSID or a reverse DNS name may be in any script; only control
	// characters are stripped.
	assert.equal(sanitizeText("Привет-сеть"), "Привет-сеть");
});

console.log(`${checks} checks passed`);