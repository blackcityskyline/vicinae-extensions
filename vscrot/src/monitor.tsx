import { useState, useEffect } from "react";
import {
	Action,
	ActionPanel,
	Detail,
	Icon,
	List,
	closeMainWindow,
} from "@vicinae/api";
import { getPrefs, isNativeHandoff } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import {
	TEMP_PATH,
	getSavePath,
	removeTempCapture,
	saveImageFile,
} from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { applyAnnotationFlow, annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { type MonitorInfo, listMonitors } from "./lib/monitors";
import { getAnnotator } from "./annotators";
import { pickAnnotator, resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

type Phase = "loading" | "selecting" | "preview" | "empty";

export default function CaptureMonitor() {
	const prefs = getPrefs();
	const [phase, setPhase] = useState<Phase>("loading");
	const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [savedPath, setSavedPath] = useState<string | null>(null);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);

	// A null result means the capture was cancelled or failed; leaving the phase
	// at "loading" would show a spinner that never resolves.
	const applyResult = async (result: string | null, annotatorId: string | null) => {
		if (!result) {
			setPhase("empty");
			return;
		}
		if (isNativeHandoff()) {
			setSavedPath(result);
			setPhase("empty");
			if (prefs.autoclose_vicinae) closeMainWindow();
			return;
		}

		const flow = prefs.annotation_flow ?? "after_capture";
		const preview =
			flow === "off"
				? result
				: ((await applyAnnotationFlow(result, prefs, annotatorId)) ?? result);

		// A notify flow saves the capture and removes the temp file behind it, so
		// the preview has to point at what the flow left on disk.
		setLastCapture(preview);
		setPhase("preview");
	};

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	useEffect(() => {
		(async () => {
			const [backend, annotator] = await Promise.all([
				resolveBackend(prefs, "monitor"),
				resolveAnnotator(prefs),
			]);

			setActiveBackendId(backend?.id ?? null);
			setActiveAnnotatorId(annotator?.id ?? null);

			// Only offer a picker when the backend can actually capture the chosen
			// output. Spectacle and gnome-screenshot capture whichever monitor the
			// cursor is on, so for them the honest behaviour is to capture that one
			// directly rather than presenting a choice that cannot be honoured.
			if (backend?.targetsNamedOutput) {
				const monitors = listMonitors();
				if (monitors.length > 0) {
					setMonitors(monitors);
					setPhase("selecting");
					return;
				}
			}

			if (backend?.listDisplays) {
				try {
					const displays = await backend.listDisplays();
					if (displays.length > 0) {
						setMonitors(
							displays.map((d) => ({ name: d.id, description: d.name })),
						);
						setPhase("selecting");
						return;
					}
				} catch (e) {
					console.error("Failed to list displays", e);
				}
			}

			// No picker: capture the monitor the backend defaults to (the current
			// one for Spectacle and friends).
			if (backend) {
				await applyResult(
					await captureScreenshot("monitor", backend.id),
					annotator?.id ?? null,
				);
			} else {
				setPhase("empty");
			}
		})();
	}, []);

	const captureByName = async (monitorName: string) => {
		if (!activeBackendId) return;
		setPhase("loading");
		await applyResult(
			await captureScreenshot("monitor", activeBackendId, 0, monitorName),
			activeAnnotatorId,
		);
	};

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;

	const handleSave = () => {
		if (!lastCapture) return;
		saveImageFile(lastCapture, getSavePath(prefs));
		setLastCapture(null);
		if (prefs.autoclose_vicinae) closeMainWindow();
	};

	const handleAnnotate = async () => {
		if (!lastCapture) return;
		const annotator = pickAnnotator(prefs, activeAnnotatorId);
		if (!annotator) return;
		const shouldReload = await annotateWith(lastCapture, annotator);
		if (shouldReload) refreshPreview();
	};

	if (phase === "preview" && lastCapture) {
		return (
			<PreviewDetail
				imagePath={lastCapture}
				suggestedName={formatDateTokens(prefs.filename_format)}
				subfolder={
					prefs.subfolder_format
						? formatDateTokens(prefs.subfolder_format)
						: "Root"
				}
				annotatorLabel={annotatorLabel}
				onSave={handleSave}
				onCopy={() => copyToClipboard(lastCapture, prefs.autoclose_vicinae)}
				onAnnotate={handleAnnotate}
				onRefreshPreview={refreshPreview}
				onReshoot={() => {
					setLastCapture(null);
					setPhase("selecting");
				}}
				onDiscard={() => {
					removeTempCapture();
					setLastCapture(null);
					setPhase("selecting");
				}}
			/>
		);
	}

	if (phase === "selecting") {
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
									onAction={() => captureByName(m.name)}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List>
		);
	}

	return (
		<Detail
			markdown={
				savedPath
					? `## Screenshot saved\n\n\`${savedPath}\``
					: phase === "loading"
						? "## Capturing..."
						: "## No screenshot captured\n\nThe capture was cancelled, or no capture tool is available for this session."
			}
		/>
	);
}
