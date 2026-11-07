import assert from "node:assert/strict";

import { initialState } from "../src/utils/speedtest.ts";
import type { TestState } from "../src/utils/speedtest.ts";
import { speedtestView } from "../src/utils/speedtest-view.ts";

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

const idle: TestState = initialState();

const complete: TestState = {
	...initialState(),
	phase: "complete",
	downloadMbps: 86.678,
	uploadMbps: 89.026,
	pingMs: 5.699,
	result: {
		downloadMbps: 86.678,
		uploadMbps: 89.026,
		pingMs: 5.699,
		jitterMs: null,
		isp: "Beltelecom",
		externalIp: "203.0.113.7",
		server: { id: "3704", name: "UNET.BY", location: "Minsk", country: "Belarus" },
		resultUrl: "",
	},
};

check("an untouched test offers the start", () => {
	const view = speedtestView(idle, { running: false, started: false, error: "", kind: null });
	assert.equal(view.download, "—");
	assert.equal(view.upload, "—");
	assert.equal(view.status, "Not started");
	assert.equal(view.subtitle, "Download, upload and latency");
});

check("the python backend reports one phase", () => {
	const view = speedtestView(idle, { running: true, started: true, error: "", kind: "python" });
	assert.equal(view.status, "Testing download and upload…");
	assert.equal(view.subtitle, "Testing download and upload…");
	assert.equal(view.download, "—");
	assert.equal(view.upload, "—");
});

check("the ookla phases name themselves", () => {
	const ping = speedtestView({ ...idle, phase: "ping" }, { running: true, started: true, error: "", kind: "ookla" });
	assert.equal(ping.status, "Measuring latency…");
	assert.equal(ping.download, "—");

	const download = speedtestView(
		{ ...idle, phase: "download", downloadMbps: 12.34 },
		{ running: true, started: true, error: "", kind: "ookla" },
	);
	assert.equal(download.status, "Testing download…");
	assert.equal(download.download, "12 Mbps");
	assert.equal(download.upload, "—");

	const upload = speedtestView(
		{ ...idle, phase: "upload", downloadMbps: 12.34, uploadMbps: 3.5 },
		{ running: true, started: true, error: "", kind: "ookla" },
	);
	assert.equal(upload.status, "Testing upload…");
	assert.equal(upload.upload, "3.5 Mbps");
});

check("a finished test keeps its readings", () => {
	const view = speedtestView(complete, { running: false, started: true, error: "", kind: "python" });
	assert.equal(view.download, "87 Mbps");
	assert.equal(view.upload, "89 Mbps");
	assert.equal(view.status, "Complete");
	assert.equal(view.subtitle, "87 Mbps down · 89 Mbps up");
});

check("a stopped test says so and keeps no result", () => {
	const view = speedtestView(
		{ ...idle, phase: "download", downloadMbps: 5 },
		{ running: false, started: true, error: "", kind: "ookla" },
	);
	assert.equal(view.status, "Stopped");
	assert.equal(view.subtitle, "Stopped");
	assert.equal(view.download, "5.0 Mbps");
});

check("a failure shows the error in the panel, not the row", () => {
	const error = "Speedtest CLI not found. Install Ookla's CLI.";
	const view = speedtestView(idle, { running: false, started: true, error, kind: null });
	assert.equal(view.status, error);
	assert.equal(view.subtitle, "Failed");
});

console.log(`${checks} checks passed`);
