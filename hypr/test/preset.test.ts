import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	BORDER_STYLES,
	FLOW_SLUG,
	LIVE_SLUG,
	PULSE_SLUG,
	SWEEP_SLUG,
	borderColors,
	parseDch,
	parseDux,
	parseSkwdFlat,
	parseSkwdScheme,
	renderBorder,
	resolvePalette,
} from "../src/utils/palette.ts";
import {
	composeActive,
	formatState,
	mergePresets,
	parseMeta,
	parseState,
	toPreset,
} from "../src/utils/preset.ts";

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

const assets = join(__dirname, "..", "assets");
const files = (dir: string, extension: string) =>
	readdirSync(dir)
		.filter((file) => file.endsWith(extension))
		.sort();
const presetFiles = files(join(assets, "presets"), ".lua");
const borderFiles = files(join(assets, "borders"), ".lua");
const shaderFiles = files(join(assets, "shaders"), ".frag");
const source = (dir: string, file: string) => readFileSync(join(assets, dir, file), "utf8");
const base = source(".", "base.lua");

check("metadata comes from the leading directives, not from prose comments", () => {
	const lua = parseMeta("-- @name Crystal\n-- @tag Vibe\n-- @description Glassy.\n\n-- some prose\n");
	assert.deepEqual(lua, { name: "Crystal", tag: "Vibe", description: "Glassy." });
	const frag = parseMeta("//@Title: Night Light\n//@Tag: WARM\n//@Desc: Warmth.\n");
	assert.deepEqual(frag, { name: "Night Light", tag: "WARM", description: "Warmth." });
});

check("a personal file without directives gets a title from its filename", () => {
	const preset = toPreset("diablo1", "-- Diablo-1 animations\n", "personal", "animation");
	assert.equal(preset.name, "Diablo1");
	assert.equal(preset.tag, "Personal");
	assert.equal(preset.description, "");
});

check("a personal file with the same slug replaces the shipped preset", () => {
	const shipped = [
		toPreset("spring", "-- @name Spring\n", "shipped", "animation"),
		toPreset("linear", "-- @name Linear\n", "shipped", "animation"),
	];
	const personal = [
		toPreset("spring", "-- mine, tweaked\n", "personal", "animation"),
		toPreset("custom", "-- mine\n", "personal", "animation"),
	];
	const merged = mergePresets(shipped, personal);
	assert.deepEqual(
		merged.map((preset) => `${preset.origin}:${preset.slug}`),
		["shipped:linear", "personal:spring", "personal:custom"],
	);
	assert.equal(merged.find((preset) => preset.slug === "spring")?.origin, "personal");
});

check("base is written before the preset so the preset is what wins", () => {
	const active = composeActive(base, {
		enabled: true,
		animation: { slug: "linear", source: 'hl.animation({ leaf = "windowsOut", enabled = true })' },
	});
	assert.ok(active.indexOf('leaf = "global"') < active.indexOf("-- animation: linear"));
	assert.ok(active.indexOf("-- animation: linear") < active.indexOf('leaf = "windowsOut", enabled = true })'));
});

check("borders and shaders are appended after the animation layer", () => {
	const active = composeActive(base, {
		enabled: true,
		animation: { slug: "linear", source: "-- anim" },
		border: { slug: "duo", source: "-- border" },
		shader: { slug: "night", path: "/home/x/.config/hypr/animations/shader.frag" },
	});
	assert.ok(active.indexOf("-- anim") < active.indexOf("-- border: duo"));
	assert.ok(active.indexOf("-- border: duo") < active.indexOf("-- shader: night"));
	assert.ok(active.includes('screen_shader = "/home/x/.config/hypr/animations/shader.frag"'));
});

check("the border size preference overrides the size inside the preset", () => {
	const active = composeActive(base, {
		enabled: true,
		border: { slug: "duo", source: "hl.config({ general = { border_size = 2 } });" },
		borderSize: 4,
	});
	assert.ok(active.indexOf("border_size = 2") < active.indexOf("border_size = 4"));
	assert.match(active, /hl\.config\(\{ general = \{ border_size = 4 \} \}\);\s*$/);
	assert.ok(!composeActive(base, { enabled: true, borderSize: 4 }).includes("border_size = 4"));
});

check("a disabled composition keeps borders and shaders but turns animations off", () => {
	const active = composeActive(base, {
		enabled: false,
		animation: { slug: "linear", source: "-- anim" },
		border: { slug: "duo", source: "-- border" },
	});
	assert.ok(!active.includes('leaf = "global"'), "base must not be written when animations are disabled");
	assert.ok(!active.includes("-- anim"), "the animation preset must not be written either");
	assert.ok(active.includes("enabled = false"));
	assert.ok(active.includes("-- border: duo"));
});

check("state round-trips all four keys and treats a missing file as disabled", () => {
	const state = { enabled: true, last: "nitro", border: "duo", shader: "night" };
	assert.deepEqual(parseState(formatState(state)), state);
	assert.deepEqual(parseState(""), { enabled: false, last: null, border: null, shader: null });
});

check("the base enables the leaves that were disabled before this extension", () => {
	for (const leaf of ["global", "windowsOut", "fadeOut", "layersOut", "fadeLayersOut", "workspacesOut"]) {
		assert.match(base, new RegExp(`leaf = "${leaf}", enabled = true`), `${leaf} must be enabled in base.lua`);
	}
});

check("the base closes windows slower than it opens them", () => {
	const speed = (leaf: string) => {
		const match = new RegExp(`leaf = "${leaf}", enabled = true, speed = ([0-9.]+)`).exec(base);
		assert.ok(match?.[1], `base.lua: ${leaf} is not enabled with a speed`);
		return Number(match[1]);
	};
	assert.ok(speed("windowsOut") > speed("windowsIn"), "base.lua: windowsOut must be slower than windowsIn");
});

check("every shipped animation preset is labelled and closes slower than it opens", () => {
	assert.ok(presetFiles.length > 0);
	for (const file of presetFiles) {
		const text = source("presets", file);
		const meta = parseMeta(text);
		assert.ok(meta.name, `${file}: missing @name`);
		assert.ok(meta.tag, `${file}: missing @tag`);
		assert.ok(meta.description, `${file}: missing @description`);
		const speed = (leaf: string) => {
			const match = new RegExp(`leaf = "${leaf}", enabled = true, speed = ([0-9.]+)`).exec(text);
			assert.ok(match?.[1], `${file}: ${leaf} is not enabled with a speed`);
			return Number(match[1]);
		};
		// A larger speed is a longer animation, so out must be larger than in.
		assert.ok(speed("windowsOut") > speed("windowsIn"), `${file}: windowsOut must be slower than windowsIn`);
	}
});

check("every shipped border is labelled, sizes the border and never leaves a palette token", () => {
	assert.ok(borderFiles.length > 0);
	for (const file of borderFiles) {
		const text = source("borders", file);
		const meta = parseMeta(text);
		assert.ok(meta.name, `${file}: missing @name`);
		assert.ok(meta.description, `${file}: missing @description`);
		assert.match(text, /border_size = 2,/, `${file}: must set a visible border size`);
		assert.match(text, /active_border = \{ colors = \{/, `${file}: must set a gradient`);
		assert.ok(!text.includes("$"), `${file}: palette tokens must be expanded`);
	}
});

check("every shipped shader is labelled in its own header comment", () => {
	assert.ok(shaderFiles.length > 0);
	for (const file of shaderFiles) {
		const meta = parseMeta(source("shaders", file));
		assert.ok(meta.name, `${file}: missing @Title`);
		assert.ok(meta.tag, `${file}: missing @Tag`);
		assert.ok(meta.description, `${file}: missing @Desc`);
	}
});

// Shapes below are copied from the real producers: DCH roles carry both modes,
// Dux nests colours under the mode, skwd's scheme nests each role by mode and
// its flat file has neither. Nothing here is generated by the code under test.
const dch = JSON.stringify({
	version: 1,
	mode: "dark",
	roles: {
		primary: { dark: "#a6cbe6", light: "#2f6482" },
		secondary: { dark: "#b6c9d8", light: "#425460" },
		tertiary: { dark: "#dadeff", light: "#3d456c" },
		error: { dark: "#fa746f", light: "#a83836" },
		surface: { dark: "#0b0f11", light: "#f7f9fd" },
	},
});
const dux = JSON.stringify({
	mode: "dark",
	colors: {
		dark: { primary: "#5b5c7c", secondary: "#5b5c7e", tertiary: "#5b5c7f", error: "#ff0000" },
		light: { primary: "#4a4b6a", secondary: "#4a4b6c", tertiary: "#4a4b6e", error: "#aa0000" },
	},
});
const skwdScheme = JSON.stringify({
	mode: "light",
	colors: {
		primary: { dark: { color: "#111111" }, light: { color: "#eeeeee" } },
		secondary: { dark: { color: "#121212" }, light: { color: "#ededed" } },
		tertiary: { dark: { color: "#131313" }, light: { color: "#ececec" } },
	},
});
const skwdFlat = JSON.stringify({ primary: "#5b5c7c", secondary: "#5b5c7e", tertiary: "#5b5c7f" });

check("each palette format reads the half its own mode selects", () => {
	assert.deepEqual(borderColors(parseDch(dch)!), [
		"rgb(166,203,230)",
		"rgb(182,201,216)",
		"rgb(218,222,255)",
		"rgb(250,116,111)",
	]);
	assert.equal(parseDux(dux)?.mode, "dark");
	assert.deepEqual(borderColors(parseDux(dux)!)[0], "rgb(91,92,124)");
	assert.equal(parseSkwdScheme(skwdScheme)?.mode, "light");
	assert.deepEqual(borderColors(parseSkwdScheme(skwdScheme)!)[0], "rgb(238,238,238)");
	assert.equal(parseSkwdFlat(skwdFlat)?.mode, "dark");
});

check("the first source with two or more border roles wins", () => {
	const resolve = (texts: Array<string | null>) =>
		resolvePalette([
			{ parse: parseDch, text: texts[0] ?? null },
			{ parse: parseDux, text: texts[1] ?? null },
			{ parse: parseSkwdFlat, text: texts[2] ?? null },
		]);
	assert.equal(borderColors(resolve([dch, dux, skwdFlat])!)[0], "rgb(166,203,230)", "DCH must win");
	assert.equal(borderColors(resolve(["{}", dux, skwdFlat])!)[0], "rgb(91,92,124)", "Dux is the fallback");
	assert.equal(borderColors(resolve([null, null, skwdFlat])!)[0], "rgb(91,92,124)", "skwd is the last fallback");
	assert.equal(resolve([null, null, null]), null);
});

check("the generated live border expands roles and stays a valid preset", () => {
	const colors = borderColors(parseDch(dch)!);
	const lua = renderBorder(colors, BORDER_STYLES[LIVE_SLUG]!);
	assert.ok(!lua.includes("$"), "palette tokens must be expanded");
	assert.match(lua, /border_size = 2,/);
	assert.match(lua, /active_border = \{ colors = \{ "rgb\(166,203,230\)"/);
	assert.match(lua, /inactive_border = "rgb\(0,0,0\)"/);
	assert.match(lua, /angle = 45/);
	assert.match(lua, /borderangle", enabled = false/);
	assert.deepEqual(parseMeta(lua), {
		name: "Live Palette",
		tag: "Dynamic",
		description: "Border colours follow the active DCH, Dux or skwd palette.",
	});
});

check("the moving live border loops the same palette", () => {
	const lua = renderBorder(borderColors(parseDch(dch)!), BORDER_STYLES[FLOW_SLUG]!);
	assert.match(lua, /borderangle", enabled = true, speed = 40, bezier = "linear", style = "loop"/);
	assert.match(lua, /active_border = \{ colors = \{ "rgb\(166,203,230\)"/);
	assert.ok(lua.includes("Spin"), "the moving preset must say so in its name/tag");
	assert.deepEqual(parseMeta(lua), {
		name: "Follow Colors Spin",
		tag: "Spin",
		description: "The live palette gradient rotates around the focused window.",
	});
});

check("the focus sweep uses the same palette once per focus, twice as fast", () => {
	const lua = renderBorder(borderColors(parseDch(dch)!), BORDER_STYLES[SWEEP_SLUG]!);
	assert.match(lua, /enabled = true, speed = 10, bezier = "linear", style = "once"/);
	assert.deepEqual(parseMeta(lua), {
		name: "Follow Colors Sweep",
		tag: "Sweep",
		description: "The live palette sweeps once around a window when it gains focus.",
	});
});

check("the heartbeat pulse rotates with its own easing", () => {
	const lua = renderBorder(borderColors(parseDch(dch)!), BORDER_STYLES[PULSE_SLUG]!);
	assert.match(lua, /hl\.curve\("follow_pulse", \{ type = "bezier", points = \{ \{ 0\.05, 0\.9 \}, \{ 0\.1, 1 \} \} \}\);/);
	assert.match(lua, /enabled = true, speed = 40, bezier = "follow_pulse", style = "loop"/);
	assert.deepEqual(parseMeta(lua), {
		name: "Follow Colors Pulse",
		tag: "Pulse",
		description: "The live palette turns in a heartbeat rhythm, then rests.",
	});
});

check("each shipped live border carries the metadata its style generates", () => {
	for (const slug of [LIVE_SLUG, FLOW_SLUG, SWEEP_SLUG, PULSE_SLUG]) {
		const style = BORDER_STYLES[slug]!;
		assert.deepEqual(parseMeta(source("borders", `${slug}.lua`)), {
			name: style.name,
			tag: style.tag,
			description: style.description,
		});
	}
});

console.log(`\n${checks} checks passed`);
