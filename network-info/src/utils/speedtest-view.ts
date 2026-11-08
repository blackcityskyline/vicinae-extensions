import type { Backend, Phase, TestState } from "./speedtest.ts";
import { formatMbps } from "./format.ts";

export interface Roll {
	download: number | null;
	upload: number | null;
}

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
	{
		running,
		started,
		error,
		kind,
		roll,
	}: {
		running: boolean;
		started: boolean;
		error: string;
		kind: Backend | null;
		roll: Roll;
	},
): SpeedtestView {
	const result = state.result;
	const status = running
		? kind === "python"
			? state.phase === "upload"
				? "Testing upload…"
				: "Testing download…"
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

	// With no live progress only the direction being measured rolls; the one that
	// is already measured stays on its real figure and the result replaces both.
	const rolling = running && result === null && state.progress === null;
	const uploading = state.phase === "upload";
	const download =
		rolling && !uploading
			? roll.download
			: state.phase === "prepare" || state.phase === "ping"
				? null
				: state.downloadMbps;
	const upload = rolling && uploading ? roll.upload : uploading || state.phase === "complete" ? state.uploadMbps : null;

	return {
		download: formatMbps(download),
		upload: formatMbps(upload),
		status,
		subtitle,
	};
}
