import assert from "node:assert/strict";

import { formatMbps, formatPing, resultText } from "../src/utils/format.ts";
import type { TestResult } from "../src/utils/parse.ts";

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

check("formatMbps examples", () => {
	assert.equal(formatMbps(0), "0.0 Mbps");
	assert.equal(formatMbps(7.25), "7.3 Mbps");
	assert.equal(formatMbps(117.516), "118 Mbps");
	assert.equal(formatMbps(null), "—");
	assert.equal(formatMbps(undefined), "—");
	assert.equal(formatMbps(NaN), "—");
	assert.equal(formatMbps(-1), "—");
});

check("formatPing examples", () => {
	assert.equal(formatPing(0), "0.0 ms");
	assert.equal(formatPing(10.205), "10 ms");
	assert.equal(formatPing(38.2), "38 ms");
	assert.equal(formatPing(null), "—");
	assert.equal(formatPing(undefined), "—");
	assert.equal(formatPing(NaN), "—");
	assert.equal(formatPing(-1), "—");
});

const fullResult: TestResult = {
	downloadMbps: 250,
	uploadMbps: 115,
	pingMs: 38.2,
	jitterMs: 1.1,
	isp: "Example Transit",
	externalIp: "203.0.113.10",
	server: { id: "12345", name: "Example Network", location: "Seattle, WA", country: "United States" },
	resultUrl: "https://www.speedtest.net/result/c/00000000-0000-0000-0000-000000000000",
};

check("resultText full result", () => {
	const expected = [
		"Download: 250 Mbps",
		"Upload: 115 Mbps",
		"Ping: 38 ms",
		"Jitter: 1.1 ms",
		"Provider: Example Transit",
		"Server: Example Network, Seattle, WA, United States (#12345)",
		"Public IP: 203.0.113.10",
		"Result: https://www.speedtest.net/result/c/00000000-0000-0000-0000-000000000000",
	].join("\n");
	assert.equal(resultText(fullResult), expected);
});

check("resultText empty optional fields", () => {
	const empty: TestResult = {
		downloadMbps: 0,
		uploadMbps: 0,
		pingMs: null,
		jitterMs: null,
		isp: "",
		externalIp: "",
		server: { id: "", name: "", location: "", country: "" },
		resultUrl: "",
	};
	const expected = [
		"Download: 0.0 Mbps",
		"Upload: 0.0 Mbps",
		"Ping: —",
		"Server: ",
	].join("\n");
	assert.equal(resultText(empty), expected);
});

console.log(`${checks} checks passed`);
