import assert from "node:assert/strict";

import { sourceName, mpvArgs, playableUrl } from "../src/utils/music.ts";
import { advanceCommand } from "../src/api/schedule.ts";
import { minutes, validStream, volume } from "../src/utils/prefs.ts";
import {
	beginFocus,
	clockText,
	emptyState,
	expired,
	finish,
	leftMs,
	musicWanted,
	pause,
	phaseLabel,
	reset,
	resume,
	type Durations,
} from "../src/utils/state.ts";

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

const durations: Durations = {
	focusMs: 25 * 60_000,
	breakMs: 5 * 60_000,
	autoContinue: true,
	keepMusicOnBreak: false,
};
const T0 = 1_700_000_000_000;

check("the clock shows minutes and seconds, rounding up", () => {
	assert.equal(clockText(25 * 60_000), "25:00");
	assert.equal(clockText(61_400), "01:02");
	assert.equal(clockText(0), "00:00");
	assert.equal(clockText(-5000), "00:00");
});

check("a focus starts with its full length and a deadline", () => {
	const state = beginFocus(emptyState(), T0, durations.focusMs);
	assert.equal(state.phase, "focus");
	assert.equal(state.running, true);
	assert.equal(state.endsAt, T0 + durations.focusMs);
	assert.equal(leftMs(state, T0 + 60_000, durations.focusMs), durations.focusMs - 60_000);
	assert.equal(expired(state, T0 + durations.focusMs), true);
	assert.equal(expired(state, T0), false);
});

check("idle shows the length of the next focus", () => {
	assert.equal(leftMs(emptyState(), T0, durations.focusMs), durations.focusMs);
	assert.equal(phaseLabel(emptyState()), "Idle");
});

check("pause keeps the time that was left and resume continues from it", () => {
	const running = beginFocus(emptyState(), T0, durations.focusMs);
	const paused = pause(running, T0 + 10 * 60_000);
	assert.equal(paused.running, false);
	assert.equal(paused.remainingMs, 15 * 60_000);
	assert.equal(leftMs(paused, T0 + 20 * 60_000, durations.focusMs), 15 * 60_000);
	assert.equal(expired(paused, T0 + 60 * 60_000), false);
	const resumed = resume(paused, T0 + 20 * 60_000, durations.focusMs);
	assert.equal(resumed.running, true);
	assert.equal(resumed.endsAt, T0 + 35 * 60_000);
	assert.equal(phaseLabel(paused), "Focus · paused");
});

check("resume from idle begins a focus", () => {
	const resumed = resume(emptyState(), T0, durations.focusMs);
	assert.equal(resumed.phase, "focus");
	assert.equal(resumed.endsAt, T0 + durations.focusMs);
});

check("a finished focus counts the session and starts the break", () => {
	const { state, event } = finish(beginFocus(emptyState(), T0, durations.focusMs), T0 + durations.focusMs, durations);
	assert.equal(event, "focus-done");
	assert.equal(state.phase, "break");
	assert.equal(state.running, true);
	assert.equal(state.sessionsDone, 1);
	assert.equal(state.endsAt, T0 + durations.focusMs + durations.breakMs);
});

check("a finished break starts the next focus, or waits paused without auto continue", () => {
	const atBreak = finish(beginFocus(emptyState(), T0, durations.focusMs), T0, durations).state;
	const auto = finish(atBreak, T0 + 1000, durations);
	assert.equal(auto.event, "break-done");
	assert.equal(auto.state.phase, "focus");
	assert.equal(auto.state.running, true);
	assert.equal(auto.state.endsAt, T0 + 1000 + durations.focusMs);
	assert.equal(auto.state.sessionsDone, 1);

	const manual = finish(atBreak, T0 + 1000, { ...durations, autoContinue: false });
	assert.equal(manual.state.phase, "focus");
	assert.equal(manual.state.running, false);
	assert.equal(manual.state.remainingMs, durations.focusMs);
});

check("music plays through a focus, not through a break unless asked", () => {
	const running = { ...beginFocus(emptyState(), T0, durations.focusMs), source: "rain" };
	assert.equal(musicWanted(running, false), true);
	const onBreak = finish(running, T0, durations).state;
	assert.equal(musicWanted(onBreak, false), false);
	assert.equal(musicWanted(onBreak, true), true);
	assert.equal(musicWanted({ ...running, source: "" }, false), false);
	assert.equal(musicWanted(pause(running, T0), false), false);
});

check("reset forgets the session but keeps the chosen music", () => {
	const state = reset({ ...beginFocus(emptyState(), T0, durations.focusMs), source: "rain", sessionsDone: 3 });
	assert.equal(state.phase, "idle");
	assert.equal(state.sessionsDone, 0);
	assert.equal(state.source, "rain");
});

check("preferences are clamped and a bad value falls back", () => {
	assert.equal(minutes("25", 5), 25);
	assert.equal(minutes("0", 25), 1);
	assert.equal(minutes("9999", 25), 600);
	assert.equal(minutes("soon", 25), 25);
	assert.equal(minutes(undefined, 5), 5);
	assert.equal(volume("150"), 100);
	assert.equal(volume("loud", 60), 60);
	assert.equal(validStream(" https://youtu.be/x "), true);
	assert.equal(validStream("file:///etc/passwd"), false);
	assert.equal(validStream("--volume=100"), false);
});

check("the player command carries the url as data, never as an option", () => {
	const args = mpvArgs("https://example.com/x", 40);
	assert.equal(args[args.length - 2], "--");
	assert.equal(args[args.length - 1], "https://example.com/x");
	assert.ok(args.includes("--volume=40"));
	assert.equal(playableUrl("rain.oga", "/ext/assets"), "/ext/assets/rain.oga");
	assert.equal(playableUrl("https://example.com/x", "/ext/assets"), "https://example.com/x");
	assert.equal(sourceName("rain.oga"), "Rain");
});

check("the deadline shell sleeps, then launches this extension\'s advance command", () => {
	assert.equal(
		advanceCommand(90),
		"sleep 90; exec vicinae 'vicinae://launch/@black/pomodoro/advance'",
	);
	assert.match(advanceCommand(0.2), /^sleep 0; exec vicinae /);
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
