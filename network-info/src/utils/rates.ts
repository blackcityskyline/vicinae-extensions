import type { DevSample } from "./parse.ts";

export interface HistoryPoint {
	t: number;
	down: number;
	up: number;
}

export interface InterfaceRate {
	down: number;
	up: number;
}

export interface RateState {
	prev: DevSample | null;
	prevAt: number;
	down: number;
	up: number;
	smoothDown: number;
	smoothUp: number;
	peakDown: number;
	peakUp: number;
	sessionDown: number;
	sessionUp: number;
	ifaceRates: Record<string, InterfaceRate>;
	history: HistoryPoint[];
}

const HISTORY_SECONDS = 1810;

export function initialRateState(): RateState {
	return {
		prev: null,
		prevAt: 0,
		down: 0,
		up: 0,
		smoothDown: 0,
		smoothUp: 0,
		peakDown: 0,
		peakUp: 0,
		sessionDown: 0,
		sessionUp: 0,
		ifaceRates: {},
		history: [],
	};
}

export function applySample(state: RateState, sample: DevSample, nowMs: number): RateState {
	const next: RateState = { ...state, prev: sample, prevAt: nowMs };
	if (!state.prev || state.prevAt <= 0 || state.prev.iface !== sample.iface) return next;

	const dt = Math.max(0.25, (nowMs - state.prevAt) / 1000);
	const dRx = Math.max(0, sample.rx - state.prev.rx);
	const dTx = Math.max(0, sample.tx - state.prev.tx);
	next.down = dRx / dt;
	next.up = dTx / dt;
	next.smoothDown = state.smoothDown > 0 ? state.smoothDown * 0.45 + next.down * 0.55 : next.down;
	next.smoothUp = state.smoothUp > 0 ? state.smoothUp * 0.45 + next.up * 0.55 : next.up;
	next.peakDown = Math.max(state.peakDown, next.smoothDown);
	next.peakUp = Math.max(state.peakUp, next.smoothUp);
	next.sessionDown = state.sessionDown + dRx;
	next.sessionUp = state.sessionUp + dTx;

	const ifaceRates: Record<string, InterfaceRate> = {};
	for (const [iface, counters] of Object.entries(sample.interfaces)) {
		const before = state.prev.interfaces[iface];
		if (!before) continue;
		ifaceRates[iface] = {
			down: Math.max(0, counters.rx - before.rx) / dt,
			up: Math.max(0, counters.tx - before.tx) / dt,
		};
	}
	next.ifaceRates = ifaceRates;

	const t = nowMs / 1000;
	const cutoff = t - HISTORY_SECONDS;
	next.history = [
		...state.history.filter((point) => point.t >= cutoff),
		{ t, down: next.smoothDown, up: next.smoothUp },
	];
	return next;
}