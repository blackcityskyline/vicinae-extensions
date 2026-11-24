import assert from "node:assert/strict";

import { HYPRIMATE_OPTIONS } from "../src/utils/hyprimate-catalog.ts";
import {
	MANAGED_END,
	MANAGED_START,
	WINDOW_STYLES,
	WORKSPACE_STYLES,
	clampValue,
	configExpression,
	defaultValue,
	displayValue,
	globalOption,
	luaTable,
	managedBlock,
	mergeManagedBlock,
	optionKey,
	optionsFor,
	parseColor,
	parseInput,
	parseOptionOutput,
	rangeText,
	sharedSibling,
	stepOf,
	tunableGlobals,
	unitOf,
	workspaceOptionsFor,
} from "../src/utils/hyprimate.ts";

let checks = 0;

function check(name: string, run: () => void) {
	run();
	checks += 1;
	console.log(`ok ${checks} - ${name}`);
}

const float = globalOption("window.open.effect_duration");
const style = globalOption("window.style");

check("every setting has a colon key that mirrors its dotted path", () => {
	for (const option of HYPRIMATE_OPTIONS) {
		assert.equal(option.key, option.path.split(".").join(":"), option.path);
		assert.ok(option.label.length > 0, option.path);
		assert.ok(option.description.length > 0, option.path);
	}
});

check("no duplicate settings", () => {
	const seen = new Set<string>();
	for (const option of HYPRIMATE_OPTIONS) {
		assert.ok(!seen.has(option.path), `duplicate ${option.path}`);
		seen.add(option.path);
	}
});

check("styles are not repeated in the global list", () => {
	const globals = tunableGlobals();
	assert.ok(globals.length > 0);
	assert.ok(!globals.some((option) => option.path === "window.style" || option.path === "workspace.style"));
});

check("the catalog covers every style the plugin offers", () => {
	for (const style of [...WINDOW_STYLES, ...WORKSPACE_STYLES]) {
		const scoped = style.slug === "rotation" || style.slug === "planet_hop" || style.slug === "cube" || style.slug === "lava";
		const count = scoped ? workspaceOptionsFor(style.slug).length : optionsFor(style.slug, "shared").length;
		assert.ok(count > 0, `${style.slug} has no settings`);
	}
});

check("defaults are inside their own ranges and choices", () => {
	for (const option of HYPRIMATE_OPTIONS) {
		if (option.choices) assert.ok(option.choices.includes(String(option.default)), option.path);
		if (typeof option.default === "number") {
			if (option.min !== undefined) assert.ok(option.default >= option.min, option.path);
			if (option.max !== undefined) assert.ok(option.default <= option.max, option.path);
		}
		if (option.type === "color") assert.notEqual(parseColor(String(option.default)), null, option.path);
	}
});

check("scopes match the table each setting lives in", () => {
	for (const option of HYPRIMATE_OPTIONS) {
		const [, scope] = option.path.split(".");
		if (option.scope === "shared") assert.equal(scope, "options", option.path);
		if (option.scope === "workspace") assert.equal(option.path.split(".")[0], "workspace", option.path);
		if (option.scope === "open" || option.scope === "close" || option.scope === "movement") {
			assert.equal(scope, option.scope, option.path);
		}
		if (option.scope === "global") assert.equal(option.style, undefined, option.path);
	}
});

check("getoption output is read as a value and a set flag", () => {
	assert.deepEqual(parseOptionOutput("float: 0.650000\nset: false\n"), { value: 0.65, set: false });
	assert.deepEqual(parseOptionOutput("int: 4279312947\nset: true"), { value: 4279312947, set: true });
	assert.deepEqual(parseOptionOutput("bool: true\nset: true"), { value: true, set: true });
	assert.deepEqual(parseOptionOutput("str: top,left\nset: true"), { value: "top,left", set: true });
	assert.equal(parseOptionOutput("no such option"), null);
});

check("colours accept hex with or without alpha", () => {
	assert.equal(parseColor("#112233"), 0xff112233);
	assert.equal(parseColor("0xFF112233"), 0xff112233);
	assert.equal(parseColor("ff112233"), 0xff112233);
	assert.equal(parseColor("#80112233"), 0x80112233);
	assert.equal(parseColor("nope"), null);
	assert.equal(displayValue({ ...style, type: "color" }, 0xff112233), "0xFF112233");
});

check("typed values are validated against the plugin's range", () => {
	assert.deepEqual(parseInput(float, "600"), { ok: true, value: 600 });
	assert.equal(parseInput(float, "-1").ok, false);
	assert.equal(parseInput(float, "60001").ok, false);
	assert.equal(parseInput(float, "abc").ok, false);
	const count = HYPRIMATE_OPTIONS.find((option) => option.path === "window.open.options.bubble.count");
	assert.ok(count);
	assert.deepEqual(parseInput(count, "150.6"), { ok: true, value: 151 });
	assert.equal(parseInput(count, "161").ok, false);
});

check("enum and set values are checked", () => {
	const shape = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.bubble.shape");
	const sides = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.swarm.lone_window_sides");
	assert.ok(shape && sides);
	assert.deepEqual(parseInput(shape, "circle"), { ok: true, value: "circle" });
	assert.equal(parseInput(shape, "square").ok, false);
	assert.deepEqual(parseInput(sides, "top,left"), { ok: true, value: "top,left" });
	assert.equal(parseInput(sides, "top left").ok, false);
});

check("the setting path is what hyprctl takes", () => {
	assert.equal(optionKey(style), "plugin:hyprimate:window:style");
});

check("lua keeps nesting, quoting and sorting", () => {
	const liquid = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.liquid.strength");
	assert.ok(liquid);
	const expression = configExpression([
		{ option: style, value: "smoke" },
		{ option: liquid, value: 0.9 },
	]);
	assert.equal(
		expression,
		[
			"hl.config({",
			'\tplugin = {',
			'\t\thyprimate = {',
			'\t\t\twindow = {',
			'\t\t\t\toptions = {',
			'\t\t\t\t\tliquid = {',
			"\t\t\t\t\t\tstrength = 0.9,",
			"\t\t\t\t\t},",
			"\t\t\t\t},",
			'\t\t\t\tstyle = "smoke",',
			"\t\t\t},",
			"\t\t},",
			"\t},",
			"})",
		].join("\n"),
	);
});

check("colours are written as ARGB literals, not numbers", () => {
	const smokeColor = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.smoke.color");
	assert.ok(smokeColor);
	assert.match(luaTable([{ option: smokeColor, value: 0xff112233 }]), /color = 0xFF112233,/u);
});

check("the managed block is appended once and replaced after that", () => {
	const block = managedBlock([{ option: style, value: "smoke" }]);
	const head = "-- my own settings\nhl.config({ decoration = { wobble = { enabled = false } } })\n";
	const once = mergeManagedBlock(head, block);
	assert.ok(once.startsWith(head));
	assert.equal(once.indexOf(MANAGED_START), once.lastIndexOf(MANAGED_START));
	assert.ok(once.endsWith(`${MANAGED_END}\n`));

	const twice = mergeManagedBlock(once, managedBlock([{ option: style, value: "cloth" }]));
	assert.equal(twice.indexOf(MANAGED_START), twice.lastIndexOf(MANAGED_START));
	assert.match(twice, /style = "cloth"/u);
	assert.match(twice, /wobble/u);
	assert.equal(mergeManagedBlock("", block), block);
});

check("the shared twin of an override is found by path", () => {
	const openColor = HYPRIMATE_OPTIONS.find((option) => option.path === "window.open.options.liquid.color");
	const movementMass = HYPRIMATE_OPTIONS.find((option) => option.path === "window.movement.options.smoke.mass");
	const sharedStrength = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.liquid.strength");
	assert.ok(openColor && movementMass && sharedStrength);
	assert.equal(sharedSibling(openColor)?.path, "window.options.liquid.color");
	assert.equal(sharedSibling(movementMass), undefined);
	assert.equal(sharedSibling(sharedStrength), undefined);
});

check("nudges follow the range and stay on a sane step", () => {
	assert.equal(stepOf(float), 50);
	assert.equal(stepOf(style), 0);
	const strength = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.liquid.strength");
	assert.ok(strength);
	assert.equal(stepOf(strength), 0.05);
	assert.equal(clampValue(strength, 9), 1.5);
	assert.equal(clampValue(strength, -1), 0);
	assert.equal(clampValue(strength, 0.3333333), 0.333);
});

check("units and ranges read like the plugin documents them", () => {
	assert.equal(unitOf(float), "ms");
	const healing = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.burn.healing_duration");
	const wind = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.burn.wind_direction");
	assert.ok(healing && wind);
	assert.equal(unitOf(healing), "s");
	assert.equal(unitOf(wind), "°");
	assert.equal(rangeText(wind), "0 – 360");
	assert.equal(rangeText(style), "liquid · paper · cloth · swarm · bubble · smoke · burn · construction");
});

check("defaults come back in the type the plugin wants", () => {
	assert.equal(defaultValue(style), "liquid");
	assert.equal(defaultValue(float), 600);
	const color = HYPRIMATE_OPTIONS.find((option) => option.path === "window.options.smoke.color");
	assert.ok(color);
	assert.equal(defaultValue(color), 0);
});

console.log(`\n${checks} hyprimate checks passed`);
