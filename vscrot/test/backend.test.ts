import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ALL_BACKENDS,
	detectSession,
	getBackend,
	getBackendForMode,
} from "../src/backends/index.ts";
import { grimBackend } from "../src/backends/grim.ts";
import { ALL_ANNOTATORS, getAnnotator } from "../src/annotators/index.ts";
import { listWindows, parseWindows } from "../src/lib/hypr-windows.ts";
import { applyAnnotationFlow } from "../src/lib/annotate.ts";
import type { Preferences } from "../src/lib/preferences.ts";
import { CaptureCancelled, isCancellation } from "../src/backends/errors.ts";
import {
	isCommandAvailable,
	looksCancelled,
	run,
	runSelector,
	stderrOf,
} from "../src/backends/utils.ts";

/**
 * The capture path itself, with the tools that are actually installed.
 *
 * Tool resolution is the part that can be wrong without failing loudly: a
 * configured tool that the session cannot drive, an X11 binary picked inside a
 * Wayland session, a `wlr-screencopy` tool chosen on KWin. The checks below
 * resolve against the live environment and then let `grim` write a real PNG, so
 * "the backend runs" is a file on disk rather than a mock that was called.
 *
 * Interactive modes (area, window) need a human at the pointer, so they are
 * skipped here and exercised by hand; the selectors they call are checked
 * directly instead.
 */

let passed = 0;
let failed = 0;
let skipped = 0;

/**
 * A body that returns a reason saw nothing it could observe; anything it
 * asserts and does not throw is a pass. A vacuous pass is worse than a skip,
 * so "the tool is not here" has to travel back up rather than fall through.
 */
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

/** Runs `body` with the environment a different session would present. */
function withEnv(vars: Record<string, string | undefined>, body: () => void): void {
	const saved = new Map<string, string | undefined>();
	for (const [key, value] of Object.entries(vars)) {
		saved.set(key, process.env[key]);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		body();
	} finally {
		for (const [key, value] of saved) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

type Monitor = { name: string; width: number; height: number };

const hyprMonitors = (): Monitor[] | null => {
	if (!process.env.HYPRLAND_INSTANCE_SIGNATURE) return null;
	try {
		const parsed = JSON.parse(run("hyprctl", ["monitors", "-j"])) as {
			name: string;
			width: number;
			height: number;
		}[];
		return parsed.map((m) => ({ name: m.name, width: m.width, height: m.height }));
	} catch {
		return null;
	}
};

const isPng = (path: string): boolean =>
	readFileSync(path).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** Width and height straight out of the IHDR chunk. */
const pngSize = (path: string): { width: number; height: number } => {
	const bytes = readFileSync(path);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

async function main(): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "vscrot-backend-"));
	// `grim` being on PATH is not the same as being able to run: the compositor must
	// speak wlr-screencopy. Resolution answers both, so a check asks it rather than
	// re-deriving the rule.
	const canCapture =
		isCommandAvailable("grim") &&
		isCommandAvailable("slurp") &&
		getBackend("grim") !== null;

	await check("installed tools are found and absent ones are not", () => {
		assert.equal(isCommandAvailable("sh"), true);
		assert.equal(isCommandAvailable("vscrot-no-such-tool-0f3a"), false);
	});

	await check("session detection reads the live environment", () => {
		const live = detectSession();
		assert.equal(live, "wayland", `this check runs inside a Wayland session, saw ${live}`);

		withEnv({ XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: undefined, DISPLAY: ":0" }, () => {
			assert.equal(detectSession(), "x11");
		});
		withEnv({ XDG_SESSION_TYPE: undefined, WAYLAND_DISPLAY: "wayland-9", DISPLAY: undefined }, () => {
			assert.equal(detectSession(), "wayland");
		});
		withEnv({ XDG_SESSION_TYPE: undefined, WAYLAND_DISPLAY: undefined, DISPLAY: ":0" }, () => {
			assert.equal(detectSession(), "x11");
		});
		assert.equal(detectSession(), live);
	});

	await check("a configured tool that is installed wins", () => {
		if (!canCapture) return "grim + slurp are not usable here";
		const backend = getBackendForMode("grim", "full");
		assert.equal(backend?.id, "grim");
		assert.equal(getBackend("grim")?.id, "grim");
	});

	await check("an unknown configured tool resolves like auto", () => {
		const fallback = getBackendForMode("vscrot-no-such-tool-0f3a", "full");
		const auto = getBackendForMode("auto", "full");
		assert.equal(fallback?.id, auto?.id, "an unknown tool did not fall back to auto-detection");

		// A machine with no capture tool at all resolves to nothing, and that is
		// the same answer auto gives; there is no result to inspect further.
		if (!fallback) return "no installed backend can capture full here";

		assert.ok(fallback.supportedModes.includes("full"));
		assert.ok(fallback.isAvailable());
		assert.ok(ALL_BACKENDS.some((candidate) => candidate.id === fallback.id));
	});

	await check("a tool that cannot serve the mode is replaced, not used", () => {
		let checked = 0;
		for (const backend of ALL_BACKENDS) {
			if (backend.supportedModes.includes("area") || !backend.isAvailable()) continue;
			checked += 1;
			const resolved = getBackendForMode(backend.id, "area");
			assert.notEqual(
				resolved?.id,
				backend.id,
				`${backend.id} does not support area capture but was returned`,
			);
		}
		if (checked === 0) return "no installed backend lacks area capture";
	});

	await check("run hands a path with shell syntax through untouched", async () => {
		if (!canCapture) return "grim + slurp are not usable here";
		const dir = join(root, "cv $(echo pwned) 'quoted' \"spaced\"");
		mkdirSync(dir, { recursive: true });
		const target = join(dir, "shot.png");

		await grimBackend.capture("full", target);

		assert.ok(statSync(target).size > 1000, "the capture is implausibly small");
		assert.equal(isPng(target), true);
		assert.equal(existsSync(join(dir, "pwned")), false, "the path was handed to a shell");
	});

	await check("a full capture is a PNG the size of the screen", async () => {
		if (!canCapture) return "grim + slurp are not usable here";
		const target = join(root, "full.png");
		await grimBackend.capture("full", target);

		const { width, height } = pngSize(target);
		assert.ok(width >= 640 && height >= 480, `${width}x${height} is not a screen`);

		// When the compositor can be asked, the PNG must be one of its screens.
		// Without an answer the size bounds above are all that can be said.
		const monitors = hyprMonitors() ?? [];
		if (monitors.length > 0) {
			const focused = monitors.find((m) => m.width === width && m.height === height);
			assert.ok(
				focused,
				`${width}x${height} matches no monitor (${monitors.map((m) => `${m.name} ${m.width}x${m.height}`).join(", ")})`,
			);
		}
	});

	await check("a monitor capture can be pointed at a named output", async () => {
		if (!canCapture) return "grim + slurp are not usable here";
		const monitors = hyprMonitors();
		if (!monitors || monitors.length === 0) return "hyprctl could not report monitors";

		const monitor = monitors[0];
		const target = join(root, "monitor.png");
		await grimBackend.capture("monitor", target, monitor.name);

		assert.equal(isPng(target), true);
		const size = pngSize(target);
		assert.ok(
			size.width >= 320 && size.height >= 240,
			`captured ${size.width}x${size.height} from ${monitor.name}`,
		);
	});

	await check("a selector returns its pick and a dismissal is not an error", () => {
		assert.equal(runSelector("/bin/sh", ["-c", "echo 10,20 300x200"]), "10,20 300x200");

		withEnv({}, () => {
			assert.throws(
				() => runSelector("/bin/sh", ["-c", "echo cancelled >&2; exit 1"]),
				(error: unknown) => isCancellation(error),
			);
			assert.throws(
				() => runSelector("/bin/sh", ["-c", "exit 1"]),
				(error: unknown) => isCancellation(error),
			);
		});
	});

	await check("a missing helper is reported, not mistaken for a cancellation", () => {
		assert.throws(
			() => runSelector("vscrot-no-such-tool-0f3a", []),
			(error: unknown) => !isCancellation(error),
		);

		let failure: unknown;
		try {
			run("/bin/sh", ["-c", "echo protocol unsupported >&2; exit 7"]);
		} catch (error) {
			failure = error;
		}

		assert.ok(failure, "the failing command reported success");
		assert.match(stderrOf(failure), /protocol unsupported/);
		assert.equal(looksCancelled(failure), false);
		assert.equal(looksCancelled(new CaptureCancelled()), false);
	});

	await check("an annotator hands out argv, not a command line", () => {
		const image = "/tmp/a b$(echo pwned) 'q'.png";

		const noctalia = getAnnotator("noctalia");
		assert.ok(noctalia, "the Noctalia annotator is not registered");
		assert.deepEqual(noctalia.command(image), [
			"noctalia",
			"msg",
			"annotate",
			image,
		]);

		const gradia = getAnnotator("gradia");
		assert.ok(gradia, "the Gradia annotator is not registered");
		assert.deepEqual(gradia.command(image), ["gradia", image]);

		const satty = getAnnotator("satty");
		assert.ok(satty);
		assert.deepEqual(satty.command(image), [
			"satty",
			"--filename",
			image,
			"--output-filename",
			image,
			"--early-exit",
		]);
	});

	await check("installed annotators report themselves as available", () => {
		const installed = ["gradia", "noctalia", "satty"].filter(isCommandAvailable);
		if (installed.length === 0) return "no annotator is installed here";
		for (const id of installed) {
			assert.equal(getAnnotator(id)?.isAvailable(), true, `${id} is installed but not available`);
		}
	});

	await check("the window picker names windows on the visible workspace", () => {
		// Shaped exactly like `hyprctl clients -j`: the fields the picker reads,
		// including a window on a second monitor whose `at` is already global.
		const raw = readFileSync(join(__dirname, "fixtures", "hypr-clients.json"), "utf8");
		const targets = parseWindows(raw, 1);

		assert.deepEqual(
			targets.map((target) => target.title),
			["alpha terminal", "beta browser", "gamma mixer"],
			"hidden, unmapped and other-workspace windows belong in no picker",
		);
		assert.deepEqual(
			targets.map((target) => target.geometry),
			["6,6 678x756", "690,6 670x756", "2000,50 400x300"],
			"a window keeps its own box, monitor offset included",
		);
		assert.equal(
			targets.find((target) => target.title === "gamma mixer")?.workspace,
			7,
			"a pinned window is named with the workspace it lives on",
		);
	});

	await check("the live window list matches what Hyprland reports", () => {
		const targets = listWindows();
		if (targets.length === 0) {
			return "hyprctl cannot see a running compositor from here";
		}
		for (const target of targets) {
			assert.match(
				target.geometry,
				/^-?\d+,-?\d+ \d+x\d+$/,
				`${target.title} has no usable geometry: ${target.geometry}`,
			);
			assert.ok(target.title.length > 0);
		}
	});

	await check("an off annotation flow touches nothing", async () => {
		const image = join(root, "flow.png");
		writeFileSync(image, "bytes");

		const off = { annotation_flow: "off" } as Preferences;
		assert.equal(await applyAnnotationFlow(image, off, "satty"), false);

		const none = { annotation_flow: "after_capture" } as Preferences;
		assert.equal(await applyAnnotationFlow(image, none, "none"), false);

		assert.equal(readFileSync(image, "utf8"), "bytes");
	});

	await check("the manifest offers every annotator that exists", () => {
		const manifest = JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf8"),
		) as {
			title: string;
			preferences: { name: string; default?: string; data?: { value: string }[] }[];
		};

		const annotationTool = manifest.preferences.find((p) => p.name === "annotation_tool");
		assert.ok(annotationTool?.data, "annotation_tool is not a dropdown");
		const offered = new Set(annotationTool.data.map((entry) => entry.value));

		for (const annotator of ALL_ANNOTATORS) {
			assert.ok(offered.has(annotator.id), `${annotator.id} exists but cannot be chosen`);
		}
		for (const id of offered) {
			if (id === "auto") continue;
			assert.ok(getAnnotator(id), `${id} can be chosen but does not exist`);
		}

		const flow = manifest.preferences.find((p) => p.name === "annotation_flow");
		assert.ok(flow, "annotation_flow is not declared");
		assert.deepEqual(
			new Set(flow.data?.map((entry) => entry.value)),
			new Set(["after_capture", "notify", "off"]),
		);
		assert.equal(
			manifest.preferences.some((p) => p.name === "use_editor"),
			false,
			"the replaced use_editor checkbox is still offered",
		);
		assert.equal(manifest.title, "VScrot+");
	});

	rmSync(root, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
	if (failed > 0) process.exit(1);
}

void main();
