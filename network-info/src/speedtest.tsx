import { Action, ActionPanel, Clipboard, Detail, getPreferenceValues, Icon, Keyboard, showToast, Toast } from "@vicinae/api";
import { useEffect, useRef, useState } from "react";

import { resolveCli, runSpeedtest } from "~/api/speedtest-cli.ts";
import type { CliInfo } from "~/api/speedtest-cli.ts";
import { initialState } from "~/utils/speedtest.ts";
import type { TestState } from "~/utils/speedtest.ts";
import { formatMbps, formatPing, resultText } from "~/utils/format.ts";

export default function SpeedtestCommand() {
	const prefs = getPreferenceValues<Preferences>();
	const configured = prefs.cliPath ?? "";

	const [state, setState] = useState<TestState>(initialState);
	const [cli, setCli] = useState<CliInfo | null>(null);
	const [error, setError] = useState("");
	const [running, setRunning] = useState(false);
	const [runId, setRunId] = useState(0);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		abortRef.current = controller;
		setState(initialState());
		setError("");
		setCli(null);
		setRunning(true);
		let live = true;

		const run = async () => {
			try {
				const resolved = await resolveCli(configured);
				if (!live) return;
				if ("error" in resolved) {
					setError(resolved.error);
					setRunning(false);
					return;
				}
				setCli(resolved.cli);
				const outcome = await runSpeedtest(resolved.cli, setState, controller.signal);
				if (!live) return;
				if (outcome.ok) setState(outcome.state);
				else setError(outcome.error);
				setRunning(false);
			} catch (err) {
				if (!live) return;
				setError(err instanceof Error ? err.message : String(err));
				setRunning(false);
			}
		};

		void run();

		return () => {
			live = false;
			controller.abort();
		};
	}, [runId, configured]);

	const result = state.result;

	const statusText = (() => {
		if (running && cli?.kind === "python") return "Testing download and upload…";
		if (!running) return "Complete";
		switch (state.phase) {
			case "prepare":
				return "Finding a server…";
			case "ping":
				return "Measuring latency…";
			case "download":
				return "Testing download…";
			case "upload":
				return "Testing upload…";
			case "complete":
				return "Finishing…";
			default:
				return "Finishing…";
		}
	})();

	const downloadDisplay =
		state.phase === "prepare" || state.phase === "ping" ? "—" : formatMbps(state.downloadMbps);
	const uploadDisplay =
		state.phase === "upload" || state.phase === "complete"
			? formatMbps(state.uploadMbps)
			: "—";

	const backendLabel = cli
		? cli.kind === "ookla"
			? "Ookla Speedtest"
			: "speedtest-cli"
		: "Detecting…";

	const location = [state.server.location, state.server.country].filter((part) => part !== "").join(", ");

	const markdown =
		`# ${downloadDisplay}\nDownload\n\n# ${uploadDisplay}\nUpload\n\n${statusText}` +
		(state.pingMs !== null && (running || state.phase === "complete")
			? `\n\nLatency · ${formatPing(state.pingMs)}`
			: "");

	const actions = (
		<ActionPanel>
			{running ? (
				<Action
					title="Cancel Test"
					icon={Icon.Xmark}
					shortcut={{ key: ".", modifiers: ["ctrl"] }}
					onAction={() => abortRef.current?.abort()}
				/>
			) : (
				<Action
					title="Run Again"
					icon={Icon.Gauge}
					shortcut={Keyboard.Shortcut.Common.Refresh}
					onAction={() => setRunId((id) => id + 1)}
				/>
			)}
			{result !== null ? (
				<Action
					title="Copy Results"
					icon={Icon.CopyClipboard}
					shortcut={Keyboard.Shortcut.Common.Copy}
					onAction={async () => {
						await Clipboard.copy(resultText(result));
						await showToast({ style: Toast.Style.Success, title: "Results copied" });
					}}
				/>
			) : null}
			{result?.resultUrl ? (
				<Action.OpenInBrowser
					title="Open Result"
					url={result.resultUrl}
					shortcut={{ key: "o", modifiers: ["ctrl"] }}
				/>
			) : null}
		</ActionPanel>
	);

	if (error) {
		return <Detail markdown={"# Speedtest failed\n\n" + error} isLoading={false} actions={actions} />;
	}

	return (
		<Detail
			isLoading={running}
			markdown={markdown}
			metadata={
				<Detail.Metadata>
					{state.pingMs !== null ? (
						<Detail.Metadata.Label title="Latency" text={formatPing(state.pingMs)} />
					) : null}
					{state.jitterMs !== null ? (
						<Detail.Metadata.Label title="Jitter" text={formatPing(state.jitterMs)} />
					) : null}
					{state.isp !== "" ? <Detail.Metadata.Label title="Provider" text={state.isp} /> : null}
					{state.server.name !== "" ? (
						<Detail.Metadata.Label title="Server" text={state.server.name} />
					) : null}
					{location !== "" ? <Detail.Metadata.Label title="Location" text={location} /> : null}
					{state.server.id !== "" ? (
						<Detail.Metadata.Label title="Server ID" text={`#${state.server.id}`} />
					) : null}
					{state.externalIp !== "" ? (
						<Detail.Metadata.Label title="Public IP" text={state.externalIp} />
					) : null}
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="CLI" text={backendLabel} />
				</Detail.Metadata>
			}
			actions={actions}
		/>
	);
}
