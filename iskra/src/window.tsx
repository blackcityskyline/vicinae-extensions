import { useEffect, useState } from "react";
import { Action, ActionPanel, Detail, Icon, List } from "@vicinae/api";
import type { CaptureBackend } from "./backends/types";
import { useCapture } from "./components/useCapture";
import { getPrefs } from "./lib/preferences";
import { type WindowTarget, listWindows } from "./lib/hypr-windows";
import { resolveBackend } from "./lib/tool-selection";

export default function CaptureWindow() {
	// undefined while the backend is still being resolved, null when none can run.
	const [backend, setBackend] = useState<CaptureBackend | null | undefined>();
	const [windows, setWindows] = useState<WindowTarget[]>([]);
	// A backend that takes a geometry can capture a window named in the list;
	// without one, its own selector is the only way to choose.
	const canPickByTitle = Boolean(backend?.captureRegion);

	const { phase, run, view } = useCapture({
		onReshoot: canPickByTitle ? () => setWindows(listWindows()) : undefined,
	});

	useEffect(() => {
		resolveBackend(getPrefs(), "window").then((resolved) => {
			setBackend(resolved);
			if (resolved?.captureRegion) setWindows(listWindows());
			else run("window", {}, resolved);
		});
	}, []);

	if (view) return view;

	if (!canPickByTitle || phase === "capturing") {
		return (
			<Detail
				markdown={
					phase === "failed"
						? "## No screenshot captured\n\nThe selection was cancelled, or the capture tool reported an error."
						: backend === undefined
							? "## Loading...\n\nLooking for a screenshot tool."
							: "## Capturing...\n\nSelect the window you want to capture."
				}
			/>
		);
	}

	// The same two actions on the list and on every row, so they are reachable
	// whether or not a window is selected.
	const sharedActions = (
		<>
			<Action
				title="Pick with Cursor"
				icon={Icon.Mouse}
				onAction={() => run("window", {}, backend)}
			/>
			<Action
				title="Refresh Windows"
				icon={Icon.ArrowClockwise}
				shortcut={{ modifiers: ["ctrl"], key: "r" }}
				onAction={() => setWindows(listWindows())}
			/>
		</>
	);

	return (
		<List
			navigationTitle="Capture Window"
			searchBarPlaceholder="Search windows..."
			actions={<ActionPanel>{sharedActions}</ActionPanel>}
		>
			<List.EmptyView
				icon={Icon.AppWindow}
				title="No windows on this workspace"
				description="Switch to a workspace with a window, refresh, or pick a box with the cursor."
			/>
			<List.Section title="Windows on This Workspace">
				{windows.map((target) => (
					<List.Item
						key={target.address}
						icon={Icon.AppWindow}
						title={target.title}
						subtitle={target.className}
						keywords={[target.className, target.title]}
						actions={
							<ActionPanel>
								<Action
									title="Capture Window"
									icon={Icon.Camera}
									onAction={() =>
										run("window", { region: target.geometry }, backend)
									}
								/>
								{sharedActions}
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
