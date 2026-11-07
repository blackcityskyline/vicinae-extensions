import type { Backend, Phase, TestState } from "./speedtest.ts";
import { formatMbps } from "./format.ts";

export interface SpeedtestView {
	download: string;
	upload: string;
	status: string;
	subtitle: string;
}

const PHASE_TEXT: Record<Phase, string> = {
	prepare: "Finding a server…",
	ping: "Measuring latency…",
	download: "Testing download…",
	upload: "Testing upload…",
	complete: "Finishing…",
	failed: "Failed",
};

export function speedtestView(
	state: TestState,
	{ running, started, error, kind }: { running: boolean; started: boolean; error: string; kind: Backend | null },
): SpeedtestView {
	const result = state.result;
	const status = running
		? kind === "python"
			? "Testing download and upload…"
			: PHASE_TEXT[state.phase]
		: error !== ""
			? error
			: result
				? "Complete"
				: started
					? "Stopped"
					: "Not started";
	const subtitle = running
		? status
		: error !== ""
			? "Failed"
			: result
				? `${formatMbps(result.downloadMbps)} down · ${formatMbps(result.uploadMbps)} up`
				: started
					? "Stopped"
					: "Download, upload and latency";

	return {
		download: state.phase === "prepare" || state.phase === "ping" ? "—" : formatMbps(state.downloadMbps),
		upload: state.phase === "upload" || state.phase === "complete" ? formatMbps(state.uploadMbps) : "—",
		status,
		subtitle,
	};
}
