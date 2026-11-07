import { useCallback, useEffect, useRef, useState } from "react";

import { getPreferenceValues } from "@vicinae/api";

import { resolveCli, runSpeedtest, type CliInfo } from "~/api/speedtest-cli.ts";
import { initialState, type TestState } from "~/utils/speedtest.ts";

export interface SpeedtestState {
	state: TestState;
	cli: CliInfo | null;
	error: string;
	running: boolean;
	started: boolean;
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

		void (async () => {
			try {
				const resolved = await resolveCli(configured);
				if (controller.signal.aborted) return;
				if ("error" in resolved) {
					setError(resolved.error);
					setRunning(false);
					return;
				}
				setCli(resolved.cli);
				const outcome = await runSpeedtest(resolved.cli, setState, controller.signal);
				if (controller.signal.aborted) return;
				if (outcome.ok) setState(outcome.state);
				else setError(outcome.error);
				setRunning(false);
			} catch (err) {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err.message : String(err));
				setRunning(false);
			}
		})();
	}, [configured]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		setRunning(false);
	}, []);

	useEffect(() => () => abortRef.current?.abort(), []);

	return { state, cli, error, running, started, start, stop };
}
