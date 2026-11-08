import { useCallback, useEffect, useRef, useState } from "react";

import { getPreferenceValues, showToast, Toast } from "@vicinae/api";

import { resolveCli, runSpeedtest, type CliInfo } from "~/api/speedtest-cli.ts";
import { formatMbps } from "~/utils/format.ts";
import { initialState, type TestState } from "~/utils/speedtest.ts";
import type { Roll } from "~/utils/speedtest-view.ts";

const EMPTY_ROLL: Roll = { download: null, upload: null };
const ROLL_TICK_MS = 250;

function randomMbps(): number {
	return 1 + Math.floor(Math.random() * 999);
}

export interface SpeedtestState {
	state: TestState;
	cli: CliInfo | null;
	error: string;
	running: boolean;
	started: boolean;
	roll: Roll;
	start: () => void;
	stop: () => void;
}

export function useSpeedtest(): SpeedtestState {
	const prefs = getPreferenceValues<Preferences>();
	const configured = prefs.cliPath ?? "";

	const [state, setState] = useState<TestState>(initialState);
	const [cli, setCli] = useState<CliInfo | null>(null);
	const [error, setError] = useState("");
	const [running, setRunning] = useState(false);
	const [started, setStarted] = useState(false);
	const [roll, setRoll] = useState<Roll>(EMPTY_ROLL);
	const abortRef = useRef<AbortController | null>(null);

	const start = useCallback(() => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		setState(initialState());
		setError("");
		setCli(null);
		setRunning(true);
		setStarted(true);
		setRoll(EMPTY_ROLL);

		void (async () => {
			const toast = await showToast({ style: Toast.Style.Animated, title: "Testing speed…" });
			try {
				const resolved = await resolveCli(configured);
				if (controller.signal.aborted) {
					void toast.hide();
					return;
				}
				if ("error" in resolved) {
					setError(resolved.error);
					setRunning(false);
					toast.style = Toast.Style.Failure;
					toast.title = "Test failed";
					toast.message = resolved.error;
					return;
				}
				setCli(resolved.cli);
				const outcome = await runSpeedtest(resolved.cli, setState, controller.signal);
				if (controller.signal.aborted) {
					void toast.hide();
					return;
				}
				if (outcome.ok) {
					setState(outcome.state);
					const result = outcome.state.result;
					toast.style = Toast.Style.Success;
					toast.title = result
						? `${formatMbps(result.downloadMbps)} down · ${formatMbps(result.uploadMbps)} up`
						: "Test finished";
				} else {
					setError(outcome.error);
					toast.style = Toast.Style.Failure;
					toast.title = "Test failed";
					toast.message = outcome.error;
				}
				setRunning(false);
			} catch (err) {
				if (controller.signal.aborted) {
					void toast.hide();
					return;
				}
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
				setRunning(false);
				toast.style = Toast.Style.Failure;
				toast.title = "Test failed";
				toast.message = message;
			}
		})();
	}, [configured]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setRunning(false);
	}, []);

	// Only the backend that reports nothing needs a clock: Ookla's events already
	// arrive four times a second, and one direction rolls at a time.
	useEffect(() => {
		if (!running || state.progress !== null) return;
		const upload = state.phase === "upload";
		const id = setInterval(() => {
			setRoll(upload ? { download: null, upload: randomMbps() } : { download: randomMbps(), upload: null });
		}, ROLL_TICK_MS);
		return () => clearInterval(id);
	}, [running, state.progress, state.phase]);

	useEffect(() => () => abortRef.current?.abort(), []);

	return { state, cli, error, running, started, roll, start, stop };
}
