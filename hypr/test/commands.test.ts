import assert from "node:assert/strict";

import {
	centerWindowCommand,
	clearLayerRuleCommands,
	closeWindowCommand,
	floatWindowCommand,
	fullscreenWindowCommand,
	layerRuleCommand,
	layerRuleName,
	moveWindowToWorkspaceCommand,
	pinWindowCommand,
} from "../src/utils/lua.ts";

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

/**
 * The expected strings are the expressions Hyprland 0.56.2 answered `ok` to
 * when they were sent to a real window, so a change in the builders that would
 * stop the compositor understanding them fails here.
 */
const ADDRESS = "0x558c48ed1cc0";

check("every window dispatcher names its window by address", () => {
	for (const command of [
		closeWindowCommand(ADDRESS),
		floatWindowCommand(ADDRESS),
		pinWindowCommand(ADDRESS),
		fullscreenWindowCommand(ADDRESS),
		centerWindowCommand(ADDRESS),
	]) {
		assert.match(command, /window = "address:0x558c48ed1cc0"/);
	}
});

check("the toggles say toggle, because the compositor has no separate on and off", () => {
	assert.equal(
		floatWindowCommand(ADDRESS),
		'hl.dsp.window.float({ action = "toggle", window = "address:0x558c48ed1cc0" })'
	);
	assert.equal(
		pinWindowCommand(ADDRESS),
		'hl.dsp.window.pin({ action = "toggle", window = "address:0x558c48ed1cc0" })'
	);
	assert.equal(
		fullscreenWindowCommand(ADDRESS),
		'hl.dsp.window.fullscreen({ action = "toggle", window = "address:0x558c48ed1cc0" })'
	);
});

check("closing and centering take no action argument", () => {
	assert.equal(
		closeWindowCommand(ADDRESS),
		'hl.dsp.window.close({ window = "address:0x558c48ed1cc0" })'
	);
	assert.equal(
		centerWindowCommand(ADDRESS),
		'hl.dsp.window.center({ window = "address:0x558c48ed1cc0" })'
	);
});

check("moving to a workspace does not follow the window", () => {
	assert.equal(
		moveWindowToWorkspaceCommand(ADDRESS, 9),
		'hl.dsp.window.move({ workspace = "9", follow = false, window = "address:0x558c48ed1cc0" })'
	);
});

check("a quote or a backslash in a name cannot end the Lua string", () => {
	assert.equal(
		layerRuleCommand('we"ird\\name', "blur", true),
		`hl.layer_rule({ name = "vicinae-layer-blur-we\\"ird\\\\name", match = { namespace = "we\\"ird\\\\name" }, blur = true })`
	);
});

check("a layer rule names itself by namespace and effect, so clearing finds it", () => {
	assert.equal(layerRuleName("dms:bar", "blur"), "vicinae-layer-blur-dms:bar");
	assert.equal(
		layerRuleCommand("dms:bar", "blur", true),
		'hl.layer_rule({ name = "vicinae-layer-blur-dms:bar", match = { namespace = "dms:bar" }, blur = true })'
	);
	assert.equal(
		layerRuleCommand("dms:bar", "blur", false),
		'hl.layer_rule({ name = "vicinae-layer-blur-dms:bar", match = { namespace = "dms:bar" }, blur = false })'
	);
});

check("clearing turns the rule off instead of forcing the opposite value", () => {
	assert.deepEqual(clearLayerRuleCommands("dms:bar", ["blur", "xray"]), [
		'hl.layer_rule({ name = "vicinae-layer-blur-dms:bar", enabled = false })',
		'hl.layer_rule({ name = "vicinae-layer-xray-dms:bar", enabled = false })',
	]);
});

console.log(`\n${checks} check(s) passed`);
