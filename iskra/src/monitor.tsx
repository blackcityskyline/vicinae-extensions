import { useEffect, useState } from "react";
import { Action, ActionPanel, Detail, Icon, List } from "@vicinae/api";
import type { CaptureBackend } from "./backends/types";
import { useCapture } from "./components/useCapture";
import { type MonitorInfo, listMonitors } from "./lib/monitors";
import { getPrefs } from "./lib/preferences";
import { resolveBackend } from "./lib/tool-selection";

/**
 * The monitors a picker can offer for `backend`, or none when the tool can only
 * capture the monitor the cursor is on: Spectacle and gnome-screenshot cannot
 * be pointed at a chosen one, so listing displays for them would offer a choice
 * that cannot be honoured.
 */
const monitorChoices = async (
	backend: CaptureBackend,
): Promise<MonitorInfo[]> => {
	if (backend.targetsNamedOutput) {
		const monitors = listMonitors();
		if (monitors.length > 0) return monitors;
	}
	if (backend.listDisplays) {
		try {
			const displays = await backend.listDisplays();
			return displays.map((d) => ({ name: d.id, description: d.name }));
		} catch (e) {
			console.error("Failed to list displays", e);
		}
	}
	return [];
};

export default function CaptureMonitor() {
	const [backend, setBackend] = useState<CaptureBackend | null>(null);
	// null while it is still being worked out; empty when there is nothing to pick.
	const [monitors, setMonitors] = useState<MonitorInfo[] | null>(null);
	const picking = monitors !== null && monitors.length > 0;

	const { phase, run, view } = useCapture({
		onReshoot: picking ? () => {} : undefined,
	});

	useEffect(() => {
		(async () => {
			const resolved = await resolveBackend(getPrefs(), "monitor");
			setBackend(resolved);
			const choices = resolved ? await monitorChoices(resolved) : [];
			setMonitors(choices);
			// No picker: capture the monitor the backend defaults to (the current
			// one for Spectacle and friends).
			if (choices.length === 0) run("monitor", {}, resolved);
		})();
	}, []);

	if (view) return view;

	if (!picking || phase === "capturing") {
		return (
			<Detail
				markdown={
					phase === "failed"
						? "## No screenshot captured\n\nThe capture was cancelled, or no capture tool is available for this session."
						: "## Capturing..."
				}
			/>
		);
	}

	return (
		<List searchBarPlaceholder="Select a monitor to capture...">
			{monitors.map((m) => (
				<List.Item
					key={m.name}
					icon={Icon.Monitor}
					title={m.name}
					subtitle={m.description}
					actions={
						<ActionPanel>
							<Action
								title="Capture Monitor"
								onAction={() => run("monitor", { outputName: m.name }, backend)}
							/>
						</ActionPanel>
					}
				/>
			))}
		</List>
	);
}
