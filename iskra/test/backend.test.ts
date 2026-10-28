import assert from "node:assert/strict";
import {
	chmodSync,
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
	captureOrder,
	detectSession,
	findBackend,
	getUsableBackends,
	pickBackend,
} from "../src/backends/index.ts";
import { noctaliaCaptureArgs, noctaliaLegacyArgs } from "../src/backends/noctalia.ts";
import {
	markNoctaliaDrive,
	noctaliaDriveMarker,
	unmarkNoctaliaDrive,
} from "../src/lib/noctalia.ts";
import { grimBackend } from "../src/backends/grim.ts";
import { ALL_ANNOTATORS, getAnnotator } from "../src/annotators/index.ts";
import { listWindows, parseWindows } from "../src/lib/hypr-windows.ts";
import { applyAnnotationFlow } from "../src/lib/annotate.ts";
import {
	annotatorOrder,
	pickAnnotator,
	resolveBackend,
	saveBackendChoice,
} from "../src/lib/tool-selection.ts";
import { LocalStorage } from "@vicinae/api";
import { pngSize } from "../src/lib/png.ts";
import { deliverCapture } from "../src/lib/deliver.ts";
import { TEMP_PATH } from "../src/lib/filesystem.ts";
import type { Preferences } from "../src/lib/preferences.ts";
import { CaptureCancelled } from "../src/backends/errors.ts";
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

/** Width and height of a PNG that must exist, via the production reader. */
const sizeOf = (path: string): { width: number; height: number } => {
	const size = pngSize(path);
	assert.ok(size, `${path} is not a readable PNG`);
	return size;
};

async function main(): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "iskra-backend-"));
	// `grim` being on PATH is not the same as being able to run: the compositor must
	// speak wlr-screencopy. Resolution answers both, so a check asks it rather than
	// re-deriving the rule.
	const canCapture =
		isCommandAvailable("grim") &&
		isCommandAvailable("slurp") &&
		pickBackend("grim")?.id === "grim";

	await check("installed tools are found and absent ones are not", () => {
		assert.equal(isCommandAvailable("sh"), true);
		assert.equal(isCommandAvailable("iskra-no-such-tool-0f3a"), false);
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
		const backend = pickBackend("grim", "", "full");
		assert.equal(backend?.id, "grim");
		assert.equal(findBackend("grim")?.id, "grim");
	});

	await check("an unknown configured tool resolves like auto", () => {
		const fallback = pickBackend("iskra-no-such-tool-0f3a", "", "full");
		const auto = pickBackend("auto", "", "full");
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
			const resolved = pickBackend(backend.id, "", "area");
			assert.notEqual(
				resolved?.id,
				backend.id,
				`${backend.id} does not support area capture but was returned`,
			);
		}
		if (checked === 0) return "no installed backend lacks area capture";
	});

	await check("a saved tool that no longer exists resolves through the order", async () => {
		const auto = pickBackend("auto");
		if (!auto) return "no capture backend can run here";

		await saveBackendChoice("iskra-no-such-tool");
		try {
			const resolved = await resolveBackend({
				screenshot_tool: "auto",
				capture_order: "",
			} as Preferences);
			assert.equal(resolved?.id, auto.id, "a stale saved choice left the command with nothing");
		} finally {
			await LocalStorage.removeItem("active_capture_tool");
		}
	});

	await check("the capture fallback order is the user's list, then the rest", () => {
		const order = captureOrder("grim, iskra-no-such-tool, grim");
		assert.equal(order[0], "grim", "the listed order is not kept");
		assert.ok(!order.includes("iskra-no-such-tool"), "an unknown id stayed in the chain");
		assert.equal(new Set(order).size, order.length, "a repeated id stayed in the chain");
		for (const backend of ALL_BACKENDS) {
			assert.ok(order.includes(backend.id), `${backend.id} is unreachable by fallback`);
		}
	});

	await check("an unavailable capture tool falls through the order", () => {
		// Resolved through the same call a command uses, so this reads the live
		// session: a tool that cannot drive it is exactly what must be skipped.
		const usable = ALL_BACKENDS.filter(
			(backend) => pickBackend(backend.id, "", "full")?.id === backend.id,
		);
		if (usable.length === 0) return "no capture backend can run here";

		const order = `iskra-no-such-tool,${usable.map((b) => b.id).join(",")}`;
		const resolved = pickBackend("auto", order, "full");
		assert.equal(
			resolved?.id,
			usable[0].id,
			"the first runnable tool in the configured order was not picked",
		);

		const missingChoice = pickBackend("iskra-no-such-tool", order, "full");
		assert.equal(
			missingChoice?.id,
			usable[0].id,
			"an unavailable choice did not fall through to the order",
		);
	});

	await check("a configured capture order beats the built-in priority", () => {
		if (!isCommandAvailable("grim")) return "grim is not installed here";

		// A tool that outranks grim in the built-in list, visible on PATH without
		// being run: this is a resolver check, not a capture check.
		const shim = join(root, "shim");
		mkdirSync(shim, { recursive: true });
		const stub = join(shim, "grimblast");
		writeFileSync(stub, "#!/bin/sh\nexit 0\n");
		chmodSync(stub, 0o755);

		withEnv(
			{
				PATH: `${shim}:${process.env.PATH ?? ""}`,
				XDG_SESSION_TYPE: "wayland",
				WAYLAND_DISPLAY: "wayland-1",
				DISPLAY: undefined,
				HYPRLAND_INSTANCE_SIGNATURE: "test",
			},
			() => {
				assert.equal(
					pickBackend("auto", "", "full")?.id,
					"grimblast",
					"the stub did not outrank grim, so the check cannot observe order",
				);
				assert.equal(
					pickBackend("auto", "grim,grimblast", "full")?.id,
					"grim",
					"the configured order lost to the built-in priority",
				);
			},
		);
	});

	await check("an installed tool that cannot drive the session is never offered", () => {
		// Every tool below is on PATH, so availability cannot be what filters them:
		// only the session and the compositor can.
		const shim = join(root, "session-shim");
		mkdirSync(shim, { recursive: true });
		for (const tool of ["grim", "slurp", "grimblast", "scrot", "maim"]) {
			const stub = join(shim, tool);
			writeFileSync(stub, "#!/bin/sh\nexit 0\n");
			chmodSync(stub, 0o755);
		}
		const session = (vars: Record<string, string | undefined>): string[] => {
			let usable: string[] = [];
			withEnv(
				{
					PATH: `${shim}:${process.env.PATH ?? ""}`,
					HYPRLAND_INSTANCE_SIGNATURE: undefined,
					SWAYSOCK: undefined,
					NIRI_SOCKET: undefined,
					XDG_CURRENT_DESKTOP: undefined,
					...vars,
				},
				() => {
					usable = getUsableBackends().map((backend) => backend.id);
				},
			);
			return usable;
		};
		const wayland = { XDG_SESSION_TYPE: "wayland", WAYLAND_DISPLAY: "wayland-1", DISPLAY: undefined };

		const kde = session({ ...wayland, XDG_CURRENT_DESKTOP: "KDE" });
		assert.ok(!kde.includes("grim"), "grim speaks wlr-screencopy, which KWin does not");
		assert.ok(!kde.includes("grimblast"), "grimblast speaks wlr-screencopy, which KWin does not");
		assert.ok(!kde.includes("scrot") && !kde.includes("maim"), "an X11 tool was offered on Wayland");

		const hyprland = session({ ...wayland, HYPRLAND_INSTANCE_SIGNATURE: "test" });
		assert.ok(hyprland.includes("grim") && hyprland.includes("grimblast"));
		assert.ok(!hyprland.includes("scrot") && !hyprland.includes("maim"));

		const x11 = session({ XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: undefined, DISPLAY: ":0" });
		assert.ok(x11.includes("scrot") && x11.includes("maim"));
		assert.ok(!x11.includes("grim") && !x11.includes("grimblast"), "a Wayland tool was offered on X11");
	});

	await check("a chosen window box is captured as that box", async () => {
		if (!canCapture) return "grim + slurp are not usable here";
		const target = join(root, "window-box.png");
		const geometry = "0,0 32x24";
		await grimBackend.captureRegion?.(geometry, target);
		assert.deepEqual(sizeOf(target), { width: 32, height: 24 });
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

		const { width, height } = sizeOf(target);
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
		const size = sizeOf(target);
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
				(error: unknown) => error instanceof CaptureCancelled,
			);
			assert.throws(
				() => runSelector("/bin/sh", ["-c", "exit 1"]),
				(error: unknown) => error instanceof CaptureCancelled,
			);
		});
	});

	await check("a missing helper is reported, not mistaken for a cancellation", () => {
		assert.throws(
			() => runSelector("iskra-no-such-tool-0f3a", []),
			(error: unknown) => !(error instanceof CaptureCancelled),
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
		// Noctalia is checked separately: a binary is not a shell.
		const installed = ["gradia", "satty"].filter(isCommandAvailable);
		if (installed.length === 0) return "no standalone annotator is installed here";
		for (const id of installed) {
			assert.equal(getAnnotator(id)?.isAvailable(), true, `${id} is installed but not available`);
		}
	});

	await check("Noctalia is available only while its shell answers", () => {
		if (!isCommandAvailable("noctalia")) return "noctalia is not installed";
		let answering = true;
		try {
			run("noctalia", ["msg", "color-scheme-get"]);
		} catch {
			answering = false;
		}
		assert.equal(
			getAnnotator("noctalia")?.isAvailable(),
			answering,
			"availability disagrees with what the shell's IPC says",
		);
	});

	await check("a Noctalia capture asks for a file in the target's own directory", () => {
		const target = join(root, "noctalia-shot.png");
		const { args, token } = noctaliaCaptureArgs("area", target);
		assert.deepEqual(args.slice(0, 2), ["msg", "screenshot-region"]);
		assert.ok(args.includes("--save-to-file"), "the capture would not reach the disk");
		assert.ok(args.includes("--no-copy-to-clipboard"), "the shell would duplicate the copy");
		assert.ok(args.includes("--no-annotate"), "the shell would run its own annotation flow");
		assert.equal(args[args.indexOf("--directory") + 1], root);
		assert.equal(args[args.indexOf("--filename-pattern") + 1], token);
		assert.equal(args[args.indexOf("--format") + 1], "png");

		const named = noctaliaCaptureArgs("monitor", target, "DP-1");
		assert.equal(named.args.at(-1), "DP-1");

		// No selector means the focused monitor, which is what a fullscreen
		// capture is; every output needs the explicit token.
		const focused = noctaliaCaptureArgs("monitor", target);
		assert.equal(focused.args.at(-1), focused.token);
		assert.equal(noctaliaCaptureArgs("full", target).args.at(-1), "all");
	});

	await check("driving Noctalia leaves a marker the pipe can see", () => {
		const marker = noctaliaDriveMarker();
		assert.equal(
			marker.startsWith(process.env.XDG_RUNTIME_DIR ?? "/tmp"),
			true,
			"the marker must live where the pipeline can reach it",
		);
		markNoctaliaDrive();
		try {
			const [pid, at] = readFileSync(marker, "utf8").trim().split(" ");
			assert.equal(Number(pid), process.pid, "the marker names the worker that asked");
			assert.ok(
				Math.abs(Number(at) * 1000 - Date.now()) < 5000,
				"the marker carries a timestamp the script can age out",
			);
		} finally {
			unmarkNoctaliaDrive();
		}
		assert.equal(existsSync(marker), false, "the marker outlived the capture");
	});

	await check("an old Noctalia gets commands, not options", () => {
		assert.deepEqual(noctaliaLegacyArgs("area"), ["msg", "screenshot-region"]);
		assert.deepEqual(noctaliaLegacyArgs("full"), [
			"msg",
			"screenshot-fullscreen",
			"all",
		]);
		assert.deepEqual(noctaliaLegacyArgs("monitor", "DP-1"), [
			"msg",
			"screenshot-fullscreen",
			"DP-1",
		]);
		assert.deepEqual(noctaliaLegacyArgs("monitor"), ["msg", "screenshot-fullscreen"]);
		assert.throws(
			() => noctaliaLegacyArgs("window"),
			/an old shell has no window command|Noctalia cannot capture/,
		);
	});

	await check("Noctalia's modes follow what its IPC can do", () => {
		if (!isCommandAvailable("noctalia")) return "noctalia is not installed";

		// The window command arrived with the per-call options. An old shell is
		// still a capture backend for the modes it has, but claiming a window mode
		// would select it for a capture that cannot happen.
		let takesOptions = false;
		try {
			takesOptions = run("noctalia", [
				"msg",
				"screenshot-fullscreen",
				"--help",
			]).includes("--directory");
		} catch {
			takesOptions = false;
		}
		let answering = true;
		try {
			run("noctalia", ["msg", "color-scheme-get"]);
		} catch {
			answering = false;
		}

		const backend = findBackend("noctalia");
		assert.ok(backend);
		assert.equal(
			backend.isAvailable(),
			answering,
			"an answering shell is a usable capture backend, options or not",
		);
		assert.equal(
			backend.supportedModes.includes("window"),
			takesOptions,
			"window capture disagrees with what the shell's IPC exposes",
		);
		if (!takesOptions) {
			assert.notEqual(
				pickBackend("noctalia", "", "window")?.id,
				"noctalia",
				"an old shell was selected for a window capture it cannot serve",
			);
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

		const off = { annotation_flow: "off", annotation_tool: "auto" } as Preferences;
		assert.equal(await applyAnnotationFlow(image, off), null);

		const none = { annotation_flow: "after_capture", annotation_tool: "none" } as Preferences;
		assert.equal(await applyAnnotationFlow(image, none), null);

		assert.equal(readFileSync(image, "utf8"), "bytes");
	});

	await check("the fallback order is the user's list, then the rest", () => {
		const order = annotatorOrder("gradia, swappy, iskra-no-such-annotator, gradia");
		assert.equal(order[0], "gradia", "the listed order is not kept");
		assert.equal(order[1], "swappy");
		assert.ok(!order.includes("iskra-no-such-annotator"), "an unknown id stayed in the chain");
		assert.equal(
			new Set(order).size,
			order.length,
			"a repeated id stayed in the chain",
		);
		for (const annotator of ALL_ANNOTATORS) {
			assert.ok(order.includes(annotator.id), `${annotator.id} is unreachable by fallback`);
		}
	});

	await check("an unavailable annotator falls through the configured order", () => {
		const installed = ALL_ANNOTATORS.filter((a) => a.isAvailable()).map((a) => a.id);
		if (installed.length < 2) {
			return "fewer than two annotators are installed, so order cannot be observed";
		}

		// Reversed on purpose: if the preference is ignored, the built-in order
		// answers with the other tool and the check reddens.
		const [builtInFirst] = installed;
		const preferred = installed[installed.length - 1];
		const prefs = {
			annotation_tool: "auto",
			annotation_order: `${preferred},iskra-no-such-annotator,${builtInFirst}`,
		} as Preferences;

		assert.equal(
			pickAnnotator(prefs)?.id,
			preferred,
			"the configured order was not followed",
		);

		// The explicit choice still wins while it can run.
		assert.equal(pickAnnotator(prefs, builtInFirst)?.id, builtInFirst);

		// A choice that cannot run is a starting point, not a dead end.
		assert.equal(
			pickAnnotator(prefs, "iskra-no-such-annotator")?.id,
			preferred,
			"an unavailable choice did not fall back to the order",
		);

		assert.equal(
			pickAnnotator({ ...prefs, annotation_tool: "none" }),
			null,
			"None must stop the chain rather than fall through",
		);
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
			if (id === "auto" || id === "none") continue;
			assert.ok(getAnnotator(id), `${id} can be chosen but does not exist`);
		}

		const orderPref = manifest.preferences.find((p) => p.name === "annotation_order");
		assert.ok(orderPref, "annotation_order is not declared");
		assert.equal(
			new Set(annotatorOrder(orderPref.default ?? "")).size,
			ALL_ANNOTATORS.length,
			"the default order cannot reach every annotator",
		);

		const captureOrderPref = manifest.preferences.find((p) => p.name === "capture_order");
		assert.ok(captureOrderPref, "capture_order is not declared");
		assert.equal(
			captureOrderPref.default ?? "",
			"",
			"a default order would silently replace auto-detection",
		);
		assert.equal(
			new Set(captureOrder(captureOrderPref.default ?? "")).size,
			ALL_BACKENDS.length,
			"the empty order cannot reach every backend",
		);

		const screenshotTool = manifest.preferences.find((p) => p.name === "screenshot_tool");
		assert.ok(screenshotTool?.data, "screenshot_tool is not a dropdown");
		const tools = new Set(screenshotTool.data.map((entry) => entry.value));
		for (const backend of ALL_BACKENDS) {
			assert.ok(tools.has(backend.id), `${backend.id} exists but cannot be chosen`);
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
		assert.equal(manifest.title, "Iskra");
	});

	await check("a PNG's size is read from its header, and nothing else is a PNG", () => {
		const png = (width: number, height: number): Buffer => {
			const header = Buffer.alloc(33);
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
			header.writeUInt32BE(13, 8);
			header.write("IHDR", 12, "latin1");
			header.writeUInt32BE(width, 16);
			header.writeUInt32BE(height, 20);
			return header;
		};
		const real = join(root, "size.png");
		writeFileSync(real, png(1920, 1080));
		assert.deepEqual(pngSize(real), { width: 1920, height: 1080 });

		const jpeg = join(root, "size.jpg");
		writeFileSync(jpeg, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]));
		assert.equal(pngSize(jpeg), null, "a JPEG was read as a PNG");

		const short = join(root, "short.png");
		writeFileSync(short, png(1, 1).subarray(0, 10));
		assert.equal(pngSize(short), null, "a truncated header was read as a size");

		assert.equal(pngSize(join(root, "absent.png")), null);
	});

	await check("delivery saves, copies and previews in one order, and honours the toggles", async () => {
		const shots = join(root, "delivered");
		const prefs = (overrides: Partial<Preferences>): Preferences =>
			({
				post_capture: "vicinae",
				annotation_flow: "off",
				annotation_tool: "none",
				screenshot_path: shots,
				subfolder_format: "",
				filename_format: "delivered",
				copy_to_clipboard: true,
				save_to_file: true,
				autoclose_vicinae: false,
				...overrides,
			}) as Preferences;
		const capture = (): string => {
			writeFileSync(TEMP_PATH, "png-bytes");
			return TEMP_PATH;
		};

		// Saved: the preview points at the saved file, and the temp capture is consumed.
		const saved = await deliverCapture(capture(), prefs({}));
		assert.deepEqual(saved, { kind: "preview", path: join(shots, "delivered.png") });
		assert.equal(readFileSync(join(shots, "delivered.png"), "utf8"), "png-bytes");
		assert.equal(existsSync(TEMP_PATH), false, "the temp capture outlived the save");

		// Save to File off: nothing is written, and the preview keeps the capture.
		rmSync(shots, { recursive: true, force: true });
		const unsaved = await deliverCapture(capture(), prefs({ save_to_file: false }));
		assert.deepEqual(unsaved, { kind: "preview", path: TEMP_PATH });
		assert.equal(existsSync(shots), false, "Save to File was off but a file was written");

		// Autoclose only counts when something was copied or saved.
		const closed = await deliverCapture(capture(), prefs({ autoclose_vicinae: true }));
		assert.deepEqual(closed, { kind: "closed" });
		const nothingDone = await deliverCapture(
			capture(),
			prefs({ autoclose_vicinae: true, save_to_file: false, copy_to_clipboard: false }),
		);
		assert.equal(nothingDone.kind, "preview", "autoclose hid a capture nothing had kept");

		// The notify flow needs a file that outlives the command, whatever Save to File says.
		const notified = await deliverCapture(
			capture(),
			prefs({ annotation_flow: "notify", annotation_tool: "none", save_to_file: false }),
		);
		assert.equal(notified.kind, "preview");

		// Native hand-off: the desktop tool's file is reported as it is, never copied again.
		rmSync(shots, { recursive: true, force: true });
		const native = await deliverCapture("/some/native.png", prefs({ post_capture: "native" }));
		assert.deepEqual(native, { kind: "native", path: "/some/native.png" });
		assert.equal(existsSync(shots), false, "native hand-off saved a second copy");
	});

	rmSync(root, { recursive: true, force: true });

	console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
	if (failed > 0) process.exit(1);
}

void main();
