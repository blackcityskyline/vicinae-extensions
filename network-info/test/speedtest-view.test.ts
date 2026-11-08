import assert from "node:assert/strict";

import { initialState } from "../src/utils/speedtest.ts";
import type { TestState } from "../src/utils/speedtest.ts";
import { speedtestView, type SpeedtestView } from "../src/utils/speedtest-view.ts";

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
		server: { id: "3704", name: "UNET.BY", location: "Minsk", country: "Belarus", distanceKm: 0.29 },
		resultUrl: "",
	},
};

function view(state: TestState, opts: Partial<Parameters<typeof speedtestView>[1]> = {}): SpeedtestView {
	return speedtestView(state, {
		running: false,
		started: false,
		error: "",
		kind: null,
		roll: { download: null, upload: null },
		...opts,
	});
}

check("an untouched test offers the start", () => {
	const v = view(idle);
	assert.equal(v.download, "—");
	assert.equal(v.upload, "—");
	assert.equal(v.status, "Not started");
	assert.equal(v.subtitle, "Download, upload and latency");
});

check("the python backend names the direction it measures", () => {
	const down = view(idle, { running: true, started: true, kind: "python" });
	assert.equal(down.status, "Testing download…");
	assert.equal(down.subtitle, "Testing download…");

	const up = view({ ...idle, phase: "upload", downloadMbps: 63 }, { running: true, started: true, kind: "python" });
	assert.equal(up.status, "Testing upload…");
	assert.equal(up.download, "63 Mbps");
});

check("the ookla phases name themselves", () => {
	const ping = view({ ...idle, phase: "ping", progress: 0.5 }, { running: true, started: true, kind: "ookla" });
	assert.equal(ping.status, "Measuring latency…");
	assert.equal(ping.download, "—");

	const download = view(
		{ ...idle, phase: "download", progress: 0.4, downloadMbps: 12.34 },
		{ running: true, started: true, kind: "ookla" },
	);
	assert.equal(download.status, "Testing download…");
	assert.equal(download.download, "12 Mbps");
	assert.equal(download.upload, "—");

	const upload = view(
		{ ...idle, phase: "upload", progress: 0.4, downloadMbps: 12.34, uploadMbps: 3.5 },
		{ running: true, started: true, kind: "ookla" },
	);
	assert.equal(upload.status, "Testing upload…");
	assert.equal(upload.download, "12 Mbps");
	assert.equal(upload.upload, "3.5 Mbps");
});

check("without live progress one direction rolls, the measured one stays", () => {
	const downloading = view(idle, {
		running: true,
		started: true,
		roll: { download: 431, upload: null },
	});
	assert.equal(downloading.download, "431 Mbps");
	assert.equal(downloading.upload, "—");

	const uploading = view(
		{ ...idle, phase: "upload", downloadMbps: 63, uploadMbps: 0 },
		{ running: true, started: true, roll: { download: null, upload: 27 } },
	);
	assert.equal(uploading.download, "63 Mbps");
	assert.equal(uploading.upload, "27 Mbps");
});

check("measured figures win over the roll", () => {
	const v = view(
		{ ...idle, phase: "download", progress: 0.4, downloadMbps: 12.34 },
		{ running: true, started: true, kind: "ookla", roll: { download: 431, upload: 27 } },
	);
	assert.equal(v.download, "12 Mbps");
	assert.equal(v.upload, "—");

	const finished = view(complete, {
		started: true,
		kind: "python",
		roll: { download: 431, upload: 27 },
	});
	assert.equal(finished.download, "87 Mbps");
	assert.equal(finished.upload, "89 Mbps");
});

check("a finished test keeps its readings", () => {
	const v = view(complete, { started: true, kind: "python" });
	assert.equal(v.download, "87 Mbps");
	assert.equal(v.upload, "89 Mbps");
	assert.equal(v.status, "Complete");
	assert.equal(v.subtitle, "87 Mbps down · 89 Mbps up");
});

check("a stopped test says so and keeps no result", () => {
	const v = view({ ...idle, phase: "download", downloadMbps: 5 }, { started: true, kind: "ookla" });
	assert.equal(v.status, "Stopped");
	assert.equal(v.subtitle, "Stopped");
	assert.equal(v.download, "5.0 Mbps");
});

check("a failure shows the error in the panel, not the row", () => {
	const error = "Speedtest CLI not found. Install Ookla's CLI.";
	const v = view(idle, { started: true, error });
	assert.equal(v.status, error);
	assert.equal(v.subtitle, "Failed");
});

console.log(`${checks} checks passed`);
