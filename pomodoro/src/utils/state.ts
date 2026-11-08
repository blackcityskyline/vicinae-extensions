import { DEFAULT_SOURCE } from "./music.ts";

export type Phase = "idle" | "focus" | "break";

export interface State {
	phase: Phase;
	running: boolean;
	/** When the current phase ends; 0 while idle or paused with no deadline. */
	endsAt: number;
	/** Leftover time for a paused phase. */
	remainingMs: number;
	/** Length of the current phase, for nothing but the progress-free display. */
	totalMs: number;
	sessionsDone: number;
	/** Chosen music; "" means no music. */
	source: string;
	musicPid: number | null;
	timerPid: number | null;
}

export interface Durations {
	focusMs: number;
	breakMs: number;
	autoContinue: boolean;
	keepMusicOnBreak: boolean;
}

export type Event = "focus-done" | "break-done" | null;

export function emptyState(): State {
	return {
		phase: "idle",
		running: false,
		endsAt: 0,
		remainingMs: 0,
		totalMs: 0,
		sessionsDone: 0,
		source: DEFAULT_SOURCE,
		musicPid: null,
		timerPid: null,
	};
}

export function leftMs(state: State, now: number, focusMs: number): number {
	if (state.phase === "idle") return focusMs;
	if (!state.running) return Math.max(0, state.remainingMs);
	return Math.max(0, state.endsAt - now);
}

export function clockText(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function phaseLabel(state: State): string {
	if (state.phase === "idle") return "Idle";
	const name = state.phase === "focus" ? "Focus" : "Break";
	return state.running ? name : `${name} · paused`;
}

export function musicWanted(state: State, keepMusicOnBreak: boolean): boolean {
	if (state.source === "" || !state.running) return false;
	return state.phase === "focus" || (state.phase === "break" && keepMusicOnBreak);
}

export function expired(state: State, now: number): boolean {
	return state.running && state.phase !== "idle" && state.endsAt > 0 && now >= state.endsAt;
}

export function beginFocus(state: State, now: number, focusMs: number): State {
	return {
		...state,
		phase: "focus",
		running: true,
		endsAt: now + focusMs,
		remainingMs: focusMs,
		totalMs: focusMs,
	};
}

export function pause(state: State, now: number): State {
	if (!state.running) return state;
	return { ...state, running: false, endsAt: 0, remainingMs: Math.max(0, state.endsAt - now) };
}

export function resume(state: State, now: number, focusMs: number): State {
	if (state.phase === "idle") return beginFocus(state, now, focusMs);
	const remaining = Math.max(0, state.remainingMs);
	return { ...state, running: true, endsAt: now + remaining, remainingMs: remaining };
}

export function reset(state: State): State {
	return { ...emptyState(), source: state.source };
}

/** Ends the current phase, by deadline or by skipping it. */
export function finish(state: State, now: number, durations: Durations): { state: State; event: Event } {
	if (state.phase === "focus") {
		return {
			state: {
				...state,
				phase: "break",
				running: true,
				endsAt: now + durations.breakMs,
				remainingMs: durations.breakMs,
				totalMs: durations.breakMs,
				sessionsDone: state.sessionsDone + 1,
			},
			event: "focus-done",
		};
	}
	if (state.phase === "break") {
		return {
			state: {
				...state,
				phase: "focus",
				running: durations.autoContinue,
				endsAt: durations.autoContinue ? now + durations.focusMs : 0,
				remainingMs: durations.focusMs,
				totalMs: durations.focusMs,
			},
			event: "break-done",
		};
	}
	return { state, event: null };
}
