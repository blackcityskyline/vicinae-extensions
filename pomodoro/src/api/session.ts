import { getPreferenceValues, sendDesktopNotification } from "@vicinae/api";

import { validStream } from "../utils/prefs.ts";
import {
	expired,
	finish,
	musicWanted,
	pause,
	reset,
	resume,
	type Durations,
	type Event,
	type State,
} from "../utils/state.ts";
import { minutes, volume as volumePreference } from "../utils/prefs.ts";
import { playChime, spawnMusic } from "./player.ts";
import { alive, stop } from "../utils/process.ts";
import { cancel, schedule } from "./schedule.ts";
import { readState, writeState } from "./store.ts";

export interface Prefs {
	focusMinutes: string;
	breakMinutes: string;
	autoContinue: boolean;
	musicOnBreak: boolean;
	chime: boolean;
	volume: string;
	customChannel: string;
}

export function readPrefs(): Prefs {
	return getPreferenceValues<Prefs>();
}

export function durations(prefs: Prefs): Durations {
	return {
		focusMs: minutes(prefs.focusMinutes, 25) * 60_000,
		breakMs: minutes(prefs.breakMinutes, 5, 1, 120) * 60_000,
		autoContinue: prefs.autoContinue !== false,
		keepMusicOnBreak: prefs.musicOnBreak === true,
	};
}

/**
 * Brings the detached processes in line with the state, then persists it:
 * mpv as long as music is wanted, and one scheduled `advance` while a phase
 * runs. Idempotent, so the view can call it after any change.
 */
async function sync(state: State, prefs: Prefs): Promise<State> {
	let next = state;
	if (musicWanted(next, durations(prefs).keepMusicOnBreak)) {
		if (!alive(next.musicPid)) next = { ...next, musicPid: spawnMusic(next.source, volumePreference(prefs.volume)) };
	} else if (alive(next.musicPid)) {
		stop(next.musicPid);
		next = { ...next, musicPid: null };
	}

	cancel(next.timerPid);
	next = { ...next, timerPid: next.running && next.phase !== "idle" ? schedule(next.endsAt) : null };
	await writeState(next);
	return next;
}

async function announce(event: Event, prefs: Prefs, d: Durations): Promise<void> {
	if (event === null) return;
	if (prefs.chime !== false) playChime();
	const focusMinutes = Math.round(d.focusMs / 60_000);
	if (event === "focus-done") {
		await sendDesktopNotification({
			title: "Focus done",
			body: `Take a ${Math.round(d.breakMs / 60_000)} minute break.`,
		});
	} else {
		await sendDesktopNotification({
			title: "Break over",
			body: d.autoContinue ? `Back to focus for ${focusMinutes} minutes.` : "Start the next focus when you are ready.",
		});
	}
}

export async function toggle(): Promise<State> {
	const prefs = readPrefs();
	const d = durations(prefs);
	const now = Date.now();
	const state = await readState();
	return sync(state.running ? pause(state, now) : resume(state, now, d.focusMs), prefs);
}

export async function skip(): Promise<State> {
	const prefs = readPrefs();
	const d = durations(prefs);
	const { state, event } = finish(await readState(), Date.now(), d);
	const next = await sync(state, prefs);
	await announce(event, prefs, d);
	return next;
}

export async function resetSession(): Promise<State> {
	const prefs = readPrefs();
	return sync(reset(await readState()), prefs);
}

export async function chooseSource(url: string): Promise<State> {
	const prefs = readPrefs();
	const state = await readState();
	if (state.source === url) return sync(state, prefs);
	if (alive(state.musicPid)) stop(state.musicPid);
	return sync({ ...state, source: url, musicPid: null }, prefs);
}

/** The one transition used by the scheduled `advance` command and by the view. */
export async function finishExpired(): Promise<State> {
	const prefs = readPrefs();
	const d = durations(prefs);
	const now = Date.now();
	const state = await readState();
	if (!expired(state, now)) return sync(state, prefs);
	const { state: next, event } = finish(state, now, d);
	const synced = await sync(next, prefs);
	await announce(event, prefs, d);
	return synced;
}

/** A custom channel from the preferences, if it is a real link. */
export function customChannel(prefs: Prefs): string {
	const url = (prefs.customChannel ?? "").trim();
	return validStream(url) ? url : "";
}
