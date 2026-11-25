import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	audioArgs,
	audioSourcesFromStored,
	failureReasonFromLog,
	isOutputDevice,
	modeFromArgs,
	outputTargetFromArgs,
	parseApplicationAudio,
	parseAudioDevices,
	parseMonitors,
	toggleAudioSource,
} from "../src/recorder.ts";

let passed = 0;
let failed = 0;

function check(name: string, body: () => void): void {
	try {
		body();
		passed++;
		console.log(`ok   ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}: ${(error as Error).message}`);
	}
}

// Every fixture below is this machine's gpu-screen-recorder 6.1.7 talking,
// captured 22.11.2026. The point of pinning real output is that the parser is
// read against the tool and not against its own idea of the tool.

check("monitors are the ids and resolutions the tool lists", () => {
	assert.deepEqual(parseMonitors("LVDS-1|1366x768\n"), [
		{ id: "LVDS-1", resolution: "1366x768" },
	]);
	assert.deepEqual(parseMonitors(""), [], "a tool that printed nothing");
});

check("audio devices keep the whole name after the first pipe", () => {
	const listed = [
		"default_output|Default output",
		"default_input|Default input",
		"alsa_output.pci-0000_00_1b.0.analog-stereo.monitor|Monitor of Built-in Audio Analog Stereo",
		"alsa_input.pci-0000_00_1b.0.analog-stereo|Built-in Audio Analog Stereo",
		"bluez_output.1C_52_16_B4_7F_F7.1.monitor|Monitor of QCY FairyBuds",
	].join("\n");

	const devices = parseAudioDevices(listed);

	assert.equal(devices.length, 5);
	assert.deepEqual(devices[4], {
		id: "bluez_output.1C_52_16_B4_7F_F7.1.monitor",
		name: "Monitor of QCY FairyBuds",
	});
	assert.equal(
		devices[2]?.name,
		"Monitor of Built-in Audio Analog Stereo",
		"the human name is not cut at a space or a second pipe",
	);
});

check("application audio is one name per line", () => {
	assert.deepEqual(parseApplicationAudio("mpv\n"), [
		{ id: "mpv", name: "mpv" },
	]);
	assert.deepEqual(
		parseApplicationAudio("mpv\nfirefox|whatever\n"),
		[{ id: "mpv", name: "mpv" }],
		"a row with a pipe is a device line, not an application",
	);
});

check("every selected source rides in one -a joined by |", () => {
	// Measured on 6.1.7: `-a 'default_output|default_input'` records desktop
	// and microphone together, and the manual spells the same example.
	assert.equal(audioArgs([]), "", "no source selected, no -a");
	assert.equal(audioArgs(["default_output"]), "-a 'default_output'");
	assert.equal(
		audioArgs(["default_output", "default_input"]),
		"-a 'default_output|default_input'",
	);
	assert.equal(
		audioArgs(["app:it's a player"]),
		"-a 'app:it'\\''s a player'",
		"a quote in an application name cannot close the shell string",
	);
});

check("picking a source twice turns it off", () => {
	assert.deepEqual(toggleAudioSource([], "default_output"), ["default_output"]);
	assert.deepEqual(
		toggleAudioSource(["default_output"], "default_input"),
		["default_output", "default_input"],
		"a second source adds instead of replacing the first",
	);
	assert.deepEqual(
		toggleAudioSource(["default_output", "default_input"], "default_output"),
		["default_input"],
	);
	assert.deepEqual(toggleAudioSource(["app:mpv"], "app:mpv"), []);
});

check("settings from the single-source dropdown still load", () => {
	assert.deepEqual(
		audioSourcesFromStored({ audioSources: ["default_input", "app:mpv"] }),
		["default_input", "app:mpv"],
	);
	assert.deepEqual(audioSourcesFromStored({ audioInput: "device:default_output" }), [
		"default_output",
	]);
	assert.deepEqual(audioSourcesFromStored({ audioInput: "app:mpv" }), ["app:mpv"]);
	assert.deepEqual(audioSourcesFromStored({ audioInput: "" }), []);
	assert.deepEqual(audioSourcesFromStored({}), []);
	assert.deepEqual(
		audioSourcesFromStored({ audioSources: [1, "default_input"] }),
		["default_input"],
		"only strings are sources",
	);
});

check("monitor devices are desktop audio, the rest are microphones", () => {
	assert.equal(
		isOutputDevice({ id: "default_output", name: "Default output" }),
		true,
	);
	assert.equal(
		isOutputDevice({
			id: "alsa_output.pci-0000_00_1b.0.analog-stereo.monitor",
			name: "Monitor of Built-in Audio Analog Stereo",
		}),
		true,
	);
	assert.equal(
		isOutputDevice({
			id: "alsa_input.pci-0000_00_1b.0.analog-stereo",
			name: "Built-in Audio Analog Stereo",
		}),
		false,
	);
});

check("the recorded file is found when its path has a space in it", () => {
	// Measured: `ps -p <pid> -o args=` prints gsr's argv unquoted, so the save
	// location arrives as plain text and the file name is the last thing in
	// the line. One whitespace-delimited word answered `/tmp/x/space dir` ->
	// `/tmp/x/space`, a folder that does not exist.
	const dir = mkdtempSync(join(tmpdir(), "gsr test "));
	const file = join(dir, "re c.mp4");
	writeFileSync(file, "");

	const argv = `gpu-screen-recorder -w LVDS-1 -s 1366x768 -c mp4 -q medium -f 60 -df no -o ${file}`;
	const target = outputTargetFromArgs(argv);

	assert.equal(target?.path, file);
	assert.equal(target?.isFile, true);
	assert.ok(target?.isFile, "a .mp4 path is a file, not a folder to open");
	assert.equal(target?.directory, dir);
});

check("an instant replay's target is the folder, spaces and all", () => {
	const dir = join(tmpdir(), "replay dir");
	const argv = `gpu-screen-recorder -w LVDS-1 -s 1366x768 -c mp4 -q medium -f 60 -r 30 -df no -o ${dir}`;

	assert.deepEqual(outputTargetFromArgs(argv), {
		path: dir,
		isFile: false,
		directory: dir,
	});
});

check("the mode is read from the buffer flag, not from the path", () => {
	const record =
		"gpu-screen-recorder -w LVDS-1 -c mp4 -df no -o /home/me/rec -r done.mp4";
	const replay =
		"gpu-screen-recorder -w LVDS-1 -c mp4 -r 30 -df no -o /home/me/clips";

	assert.equal(
		modeFromArgs(record),
		"recording",
		"a path holding `-r ` does not make a recording a replay",
	);
	assert.equal(modeFromArgs(replay), "instant-replay");
	assert.equal(
		modeFromArgs("gpu-screen-recorder -w portal --replay 30 -o /tmp/clips"),
		"instant-replay",
		"the long spelling",
	);
});

check("a failure names the cause, not the last line of the report", () => {
	// Real output of a monitor that is not there.
	const log = [
		'gsr warning: failed to find the gpu that the monitor "NOPE-1" is connected to, using the display server gpu instead',
		'gsr error: display "NOPE-1" not found, expected one of:',
		'  "screen"',
		'  "LVDS-1"    (1366x768+0+0)',
		"",
	].join("\n");

	assert.equal(
		failureReasonFromLog(log),
		'display "NOPE-1" not found, expected one of:',
	);
	assert.equal(
		failureReasonFromLog(
			"gsr error: failed to open output file\ngsr_capture_start failed\n",
		),
		"failed to open output file",
		"the bare `gsr_capture_start failed` line is the symptom, not the cause",
	);
	assert.equal(
		failureReasonFromLog(""),
		"gpu-screen-recorder stopped at once",
		"an empty log still says something",
	);
});

if (failed > 0) {
	console.log(`\n${failed} failed, ${passed} passed`);
	process.exit(1);
}
console.log(`\n${passed} checks passed`);
