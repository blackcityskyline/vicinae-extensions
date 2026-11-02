import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	closeSync,
	constants,
	existsSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readSync,
	readdirSync,
	rmSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
	HyprCapturePipeError,
	capturePipe,
	composeFrames,
	cropImage,
	encodePng,
	exportPipeCommand,
	parseGeometry,
	parsePipeResponse,
} from "../src/lib/hyprcapture-pipe.ts";
import {
	hasVicinaeLayer,
	hyprcaptureOpenCommand,
	pluginListHasHyprcapture,
	saveDirectoryFromOption,
	waitForHyprcaptureOverlay,
} from "../src/backends/hyprcapture.ts";
import { hyprcapturePipeBackend } from "../src/backends/hyprcapture-pipe.ts";
import { CaptureCancelled } from "../src/backends/errors.ts";
import { isCommandAvailable } from "../src/backends/utils.ts";

/**
 * HyprCapture without the compositor.
 *
 * The parser is checked against a response captured from the real plugin
 * (docs/audits/hyprcapture.md), the PNG against ImageMagick, the FIFO client
 * against a fake plugin on a real FIFO, and the overlay wait against a fake
 * process table. Nothing here needs Hyprland to be running.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

async function check(
	name: string,
	body: () => Promise<string | void> | string | void,
): Promise<void> {
	try {
		const reason = await body();
		if (reason) {
			skipped += 1;
			console.log(`SKIP ${name} — ${reason}`);
			return;
		}
		passed += 1;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed += 1;
		console.log(`FAIL ${name}`);
		const message = error instanceof Error ? error.message : String(error);
		console.log(`     ${message.split("\n").slice(0, 8).join("\n     ")}`);
	}
}

const FIXTURES = join(__dirname, "fixtures");

/** A response in the measured wire shape: magic, header length, JSON, frames. */
const wireResponse = (header: unknown, payload = Buffer.alloc(0)): Buffer => {
	const json = Buffer.from(JSON.stringify(header));
	return Buffer.concat([
		Buffer.from(`HYPRCAP_PIPE_V1\n${json.length}\n`),
		json,
		payload,
	]);
};

const onePixelMonitor = {
	name: "TEST-1",
	geometry: { x: 0, y: 0, width: 1, height: 1 },
	scale: 1,
	transform: 0,
	artifactWidth: 1,
	artifactHeight: 1,
	byteLength: 4,
};

const onePixelHeader = {
	ok: true,
	version: 1,
	format: "rgba8888",
	topDown: true,
	monitors: [onePixelMonitor],
};

async function main(): Promise<void> {
	await check("the open command is one of the three documented modes", () => {
		assert.equal(hyprcaptureOpenCommand("area"), "hl.plugin.hyprcapture.open('region')");
		assert.equal(hyprcaptureOpenCommand("window"), "hl.plugin.hyprcapture.open('window')");
		assert.equal(hyprcaptureOpenCommand("full"), "hl.plugin.hyprcapture.open('fullscreen')");
		assert.throws(() => hyprcaptureOpenCommand("monitor"), /cannot capture "monitor"/);
	});

	await check("the save directory is the option's value line, not its `set:` line", () => {
		const home = homedir();
		assert.equal(
			saveDirectoryFromOption("str: $HOME/Shots\nset: false"),
			join(home, "Shots"),
		);
		assert.equal(
			saveDirectoryFromOption("str: ~/Shots\nset: false"),
			join(home, "Shots"),
		);
		assert.equal(saveDirectoryFromOption("str: \nset: false"), null);
	});

	await check("the export pipe path is quoted only when it is generated-safe", () => {
		assert.equal(
			exportPipeCommand("/dev/shm/hyprcapture-1000/iskra-abc/request.fifo"),
			"hl.plugin.hyprcapture.export_pipe('/dev/shm/hyprcapture-1000/iskra-abc/request.fifo')",
		);
		assert.throws(
			() => exportPipeCommand("/dev/shm/hyprcapture-1000/iskra-a'b/request.fifo"),
			/unsafe characters/,
		);
		assert.throws(() => exportPipeCommand("/dev/shm/x/$(id)/request.fifo"), /unsafe characters/);
	});

	await check("the plugin list recognises HyprCapture and not another plugin", () => {
		assert.equal(
			pluginListHasHyprcapture("Plugin HyprCapture by wilf:\n\tHandle: 5599f1136c80\n\tVersion: 0.4.2"),
			true,
		);
		assert.equal(
			pluginListHasHyprcapture("Plugin HyprView by Vergil:\n\tHandle: 5599f10fa2d0"),
			false,
		);
	});

	await check("a real response parses into its header and one frame", () => {
		const raw = gunzipSync(readFileSync(join(FIXTURES, "hyprcapture-pipe.bin.gz")));
		const response = parsePipeResponse(raw);

		assert.equal(response.header.version, 1);
		assert.equal(response.header.format, "rgba8888");
		assert.equal(response.header.topDown, true);
		assert.equal(response.header.monitors.length, 1);
		const monitor = response.header.monitors[0]!;
		assert.equal(monitor.name, "LVDS-1");
		assert.deepEqual(monitor.geometry, { x: 0, y: 0, width: 1366, height: 768 });
		assert.equal(monitor.artifactWidth, 1366);
		assert.equal(monitor.artifactHeight, 768);
		assert.equal(response.frames.length, 1);
		assert.equal(response.frames[0]!.length, 4196352);
		assert.deepEqual([...response.frames[0]!.subarray(0, 4)], [0x11, 0x22, 0x33, 0xff]);
	});

	await check("the real error response is reported with the plugin's reason", () => {
		const raw = readFileSync(join(FIXTURES, "hyprcapture-pipe-error.bin"));
		assert.throws(
			() => parsePipeResponse(raw),
			(error: unknown) =>
				error instanceof HyprCapturePipeError &&
				/export pipe only supports fullscreen mode/.test(error.message),
		);
	});

	await check("malformed responses are refused, not read as frames", () => {
		const cases: [string, Buffer, RegExp][] = [
			["empty", Buffer.alloc(0), /wrong magic|truncated/],
			["wrong magic", Buffer.from("HYPRCAP_PIPE_V2\n2\n{}"), /wrong magic/],
			["length not decimal", Buffer.from("HYPRCAP_PIPE_V1\nx\n{}"), /not a decimal number/],
			["length too large", Buffer.from("HYPRCAP_PIPE_V1\n999999\n{}"), /out of range/],
			["header not JSON", Buffer.from("HYPRCAP_PIPE_V1\n3\n{x}"), /not valid JSON/],
			["header not object", Buffer.from("HYPRCAP_PIPE_V1\n2\n[]"), /not a JSON object/],
			["no ok flag", wireResponse({ version: 1, format: "rgba8888", topDown: true, monitors: [] }), /no ok flag/],
			["unknown version", wireResponse({ ...onePixelHeader, version: 2 }), /unsupported .* version 2/],
			["unknown format", wireResponse({ ...onePixelHeader, format: "rgb8888" }), /unsupported .* format/],
			["no topDown", wireResponse({ ...onePixelHeader, topDown: undefined }), /topDown/],
			["no monitors", wireResponse({ ...onePixelHeader, monitors: [] }), /no monitors/],
			[
				"byteLength does not match the size",
				wireResponse(
					{ ...onePixelHeader, monitors: [{ ...onePixelMonitor, byteLength: 5 }] },
					Buffer.alloc(5),
				),
				/declares 5 bytes/,
			],
			[
				"truncated frame",
				wireResponse(onePixelHeader, Buffer.alloc(2)),
				/truncated at monitor 0/,
			],
		];

		for (const [name, data, reason] of cases) {
			assert.throws(
				() => parsePipeResponse(data),
				(error: unknown) => error instanceof HyprCapturePipeError && reason.test(error.message),
				`${name} was accepted`,
			);
		}
	});

	await check("a frame is cropped in the coordinates the selector reports", () => {
		// 2x2 RGBA: red, green / blue, white.
		const rgba = Buffer.from([
			255, 0, 0, 255, 0, 255, 0, 255,
			0, 0, 255, 255, 255, 255, 255, 255,
		]);
		const response = parsePipeResponse(
			wireResponse(
				{
					ok: true,
					version: 1,
					format: "rgba8888",
					topDown: true,
					monitors: [
						{
							name: "TEST-1",
							geometry: { x: 10, y: 20, width: 2, height: 2 },
							scale: 1,
							transform: 0,
							artifactWidth: 2,
							artifactHeight: 2,
							byteLength: 16,
						},
					],
				},
				rgba,
			),
		);

		const image = composeFrames(response);
		assert.deepEqual({ width: image.width, height: image.height }, { width: 2, height: 2 });
		const bottomRight = cropImage(image, { x: 11, y: 21, width: 1, height: 1 });
		assert.deepEqual([...bottomRight.rgba], [255, 255, 255, 255]);
		assert.deepEqual(parseGeometry("11,21 1x1"), { x: 11, y: 21, width: 1, height: 1 });
		assert.throws(() => parseGeometry("11 21 1 1"), /not a capture geometry/);
		assert.throws(() => cropImage(image, { x: 100, y: 100, width: 5, height: 5 }), /outside the screen/);
	});

	await check("a chosen region is parsed before the capture, in the interface's order", async () => {
		await assert.rejects(
			hyprcapturePipeBackend.captureRegion!(
				"not-a-geometry",
				"/tmp/iskra-region-never-written.png",
			),
			(error: unknown) =>
				error instanceof HyprCapturePipeError &&
				/not a capture geometry: not-a-geometry/.test(error.message),
		);
	});

	await check("two monitors compose side by side in global coordinates", () => {
		const monitor = (name: string, x: number, rgba: number[]) => ({
			name,
			geometry: { x, y: 0, width: 1, height: 1 },
			scale: 1,
			transform: 0,
			artifactWidth: 1,
			artifactHeight: 1,
			byteLength: 4,
		});
		const response = parsePipeResponse(
			wireResponse(
				{
					ok: true,
					version: 1,
					format: "rgba8888",
					topDown: true,
					monitors: [monitor("A", 0, [1, 0, 0, 255]), monitor("B", 1, [0, 0, 1, 255])],
				},
				Buffer.from([1, 0, 0, 255, 0, 0, 1, 255]),
			),
		);

		const image = composeFrames(response);
		assert.deepEqual({ width: image.width, height: image.height }, { width: 2, height: 1 });
		assert.deepEqual([...image.rgba], [1, 0, 0, 255, 0, 0, 1, 255]);
	});

	await check("an encoded PNG is decoded by a real image tool", () => {
		if (!isCommandAvailable("identify")) return "ImageMagick identify is not installed";
		const dir = mkdtempSync(join(tmpdir(), "iskra-png-"));
		try {
			const path = join(dir, "rgba.png");
			writeFileSync(
				path,
				encodePng(2, 1, Buffer.from([255, 0, 0, 255, 0, 0, 255, 255])),
			);
			assert.equal(
				execFileSync("identify", ["-format", "%w %h %[channels]", path], { encoding: "utf8" }),
				"2 1 srgba 4.0",
			);
			assert.equal(
				execFileSync("identify", ["-format", "%[pixel:p{0,0}]", path], { encoding: "utf8" }),
				"srgba(255,0,0,1)",
			);
			assert.equal(
				execFileSync("identify", ["-format", "%[pixel:p{1,0}]", path], { encoding: "utf8" }),
				"srgba(0,0,255,1)",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("a bottom-up frame is flipped before encoding", () => {
		if (!isCommandAvailable("identify")) return "ImageMagick identify is not installed";
		const dir = mkdtempSync(join(tmpdir(), "iskra-png-"));
		try {
			const path = join(dir, "flipped.png");
			// Two rows, bottom-up: the blue row is first in memory.
			writeFileSync(
				path,
				encodePng(1, 2, Buffer.from([0, 0, 255, 255, 255, 0, 0, 255]), false),
			);
			assert.equal(
				execFileSync("identify", ["-format", "%[pixel:p{0,0}]", path], { encoding: "utf8" }),
				"srgba(255,0,0,1)",
			);
			assert.equal(
				execFileSync("identify", ["-format", "%[pixel:p{0,1}]", path], { encoding: "utf8" }),
				"srgba(0,0,255,1)",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("the FIFO client sends the documented request and reads the answer", async () => {
		if (!existsSync("/dev/shm")) return "there is no /dev/shm";
		if (!isCommandAvailable("mkfifo")) return "mkfifo is not installed";
		const uid = typeof process.getuid === "function" ? process.getuid() : 0;
		const root = `/dev/shm/hyprcapture-${uid}`;
		const leftover = () =>
			existsSync(root)
				? readdirSync(root).filter((name) => name.startsWith("iskra-"))
				: [];
		const before = leftover();
		let seenRequest: Record<string, unknown> | null = null;

		const response = wireResponse(onePixelHeader, Buffer.from([1, 2, 3, 255]));
		const result = await capturePipe({
			timeoutMs: 3000,
			runCompositor: (lua) => {
				const match = /^hl\.plugin\.hyprcapture\.export_pipe\('([^']+)'\)$/.exec(lua);
				assert.ok(match, `unexpected Lua: ${lua}`);
				const requestFifo = match[1]!;
				const requestFd = openSync(requestFifo, constants.O_RDONLY | constants.O_NONBLOCK);
				const buffer = Buffer.alloc(4096);
				const size = readSync(requestFd, buffer, 0, buffer.length, null);
				closeSync(requestFd);
				seenRequest = JSON.parse(buffer.toString("utf8", 0, size).trim()) as Record<string, unknown>;

				const responseFd = openSync(
					String(seenRequest.responseFifo),
					constants.O_WRONLY | constants.O_NONBLOCK,
				);
				writeSync(responseFd, response);
				closeSync(responseFd);
			},
		});

		assert.equal(seenRequest?.version, 1);
		assert.equal(seenRequest?.mode, "fullscreen");
		assert.equal(seenRequest?.fullscreenScope, "all");
		assert.match(String(seenRequest?.responseFifo), /^\/dev\/shm\/hyprcapture-\d+\/iskra-[^/]+\/response\.fifo$/);
		assert.deepEqual([...result.frames[0]!], [1, 2, 3, 255]);
		assert.deepEqual(leftover(), before, "the client directory outlived the capture");
	});

	await check("a silent plugin times out and the client directory is removed", async () => {
		if (!existsSync("/dev/shm")) return "there is no /dev/shm";
		if (!isCommandAvailable("mkfifo")) return "mkfifo is not installed";
		const uid = typeof process.getuid === "function" ? process.getuid() : 0;
		const root = `/dev/shm/hyprcapture-${uid}`;
		const leftover = () =>
			existsSync(root)
				? readdirSync(root).filter((name) => name.startsWith("iskra-"))
				: [];
		const before = leftover();

		await assert.rejects(
			capturePipe({ timeoutMs: 100, runCompositor: () => {} }),
			/did not answer within 100 ms/,
		);
		assert.deepEqual(leftover(), before, "the client directory outlived the timeout");

		await assert.rejects(
			capturePipe({
				runCompositor: () => {
					throw new Error("hyprctl eval failed: nope");
				},
			}),
			/hyprctl eval failed: nope/,
		);
		assert.deepEqual(leftover(), before, "the client directory outlived the failure");
	});

	await check("a compositor error printed on stdout is reported, not hidden", async () => {
		if (!existsSync("/dev/shm")) return "there is no /dev/shm";
		if (!isCommandAvailable("mkfifo")) return "mkfifo is not installed";
		const uid = typeof process.getuid === "function" ? process.getuid() : 0;
		const root = `/dev/shm/hyprcapture-${uid}`;
		const leftover = () =>
			existsSync(root)
				? readdirSync(root).filter((name) => name.startsWith("iskra-"))
				: [];
		const before = leftover();
		const dir = mkdtempSync(join(tmpdir(), "iskra-hyprctl-"));
		const path = process.env.PATH ?? "";
		try {
			// hyprctl prints a Lua error on stdout and exits 7, with an empty stderr.
			const fake = join(dir, "hyprctl");
			writeFileSync(
				fake,
				"#!/bin/sh\necho 'error: [string \"return hl...\"]:1: session locked'\nexit 7\n",
			);
			chmodSync(fake, 0o755);
			process.env.PATH = `${dir}:${path}`;
			await assert.rejects(capturePipe({ timeoutMs: 1000 }), /session locked/);
			assert.deepEqual(leftover(), before, "the client directory outlived the failure");
		} finally {
			process.env.PATH = path;
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("a Vicinae layer is found anywhere in the layer tree", () => {
		const withLauncher = JSON.stringify({
			"LVDS-1": {
				levels: {
					"0": [{ namespace: "skwd-paper" }],
					"2": [{ namespace: "vicinae" }],
				},
			},
		});
		assert.equal(hasVicinaeLayer(withLauncher), true);
		assert.equal(
			hasVicinaeLayer(JSON.stringify({ "LVDS-1": { levels: { "0": [{ namespace: "wallpaper" }] } } })),
			false,
		);
		assert.equal(hasVicinaeLayer("not json"), false);
	});

	await check("a successful overlay waits for the helper to exit", async () => {
		const dir = mkdtempSync(join(tmpdir(), "iskra-overlay-"));
		try {
			const saved = join(dir, "Screenshot-test.png");
			writeFileSync(saved, "png");
			const pids = [[], [42], [42], []];
			const thumbnails = [
				new Set<string>(),
				new Set<string>(),
				new Set(["thumbnail-preview-42-1-1.png"]),
			];
			let pidAt = 0;
			let thumbnailAt = 0;
			let clock = 0;

			const result = await waitForHyprcaptureOverlay({
				beforePids: new Set(),
				beforeThumbnails: new Set(),
				startedAt: 0,
				saveDir: dir,
				listPids: () => pids[Math.min(pidAt++, pids.length - 1)]!,
				listThumbnails: () => thumbnails[Math.min(thumbnailAt++, thumbnails.length - 1)]!,
				sleep: async () => {},
				now: () => (clock += 10),
			});

			assert.deepEqual(result, { path: saved });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("a helper that exits without a thumbnail is a cancellation", async () => {
		const pids = [[], [42], [42], []];
		let pidAt = 0;
		await assert.rejects(
			waitForHyprcaptureOverlay({
				beforePids: new Set(),
				beforeThumbnails: new Set(),
				startedAt: 0,
				saveDir: null,
				listPids: () => pids[Math.min(pidAt++, pids.length - 1)]!,
				listThumbnails: () => new Set(),
				sleep: async () => {},
				now: () => Date.now(),
			}),
			(error: unknown) => error instanceof CaptureCancelled,
		);
	});

	await check("a thumbnail without a seen process still counts as captured", async () => {
		const dir = mkdtempSync(join(tmpdir(), "iskra-overlay-"));
		try {
			const saved = join(dir, "fast.png");
			writeFileSync(saved, "png");
			const thumbnails = [new Set<string>(), new Set(["thumbnail-preview-7-1-1.png"])];
			let thumbnailAt = 0;
			const result = await waitForHyprcaptureOverlay({
				beforePids: new Set(),
				beforeThumbnails: new Set(),
				startedAt: 0,
				saveDir: dir,
				listPids: () => [],
				listThumbnails: () => thumbnails[Math.min(thumbnailAt++, thumbnails.length - 1)]!,
				sleep: async () => {},
				now: () => Date.now(),
			});
			assert.deepEqual(result, { path: saved });
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	await check("an overlay that never starts is an error, not a cancellation", async () => {
		let clock = 0;
		await assert.rejects(
			waitForHyprcaptureOverlay({
				beforePids: new Set(),
				beforeThumbnails: new Set(),
				startedAt: 0,
				saveDir: null,
				listPids: () => [],
				listThumbnails: () => new Set(),
				sleep: async () => {},
				now: () => (clock += 50),
			}),
			(error: unknown) =>
				!(error instanceof CaptureCancelled) && /did not start its overlay/.test((error as Error).message),
		);
	});

	console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
	if (failed > 0) process.exit(1);
}

void main();
