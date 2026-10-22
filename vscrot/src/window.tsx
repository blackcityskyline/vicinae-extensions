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
import { annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { listWindows, type WindowTarget } from "./lib/hypr-windows";
import { getBackend } from "./backends";
import { getAnnotator } from "./annotators";
import { resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

export default function CaptureWindow() {
	const prefs = getPrefs();
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [finished, setFinished] = useState(false);
	const [savedPath, setSavedPath] = useState<string | null>(null);
	const [discarded, setDiscarded] = useState(false);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);
	// null means "ask the tool's own selector"; a list means the user picks a
	// window by name instead of guessing which anonymous box is which.
	const [windows, setWindows] = useState<WindowTarget[] | null>(null);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	const capture = async (backendId: string, geometry?: string) => {
		setFinished(false);
		const result = await captureScreenshot(
			"window",
			backendId,
			0,
			undefined,
			geometry,
		);
		if (result) {
			// In native hand-off the desktop tool owns the result: it is already
			// saved where the user wants it, so Vicinae reports rather than previews.
			if (isNativeHandoff()) {
				setSavedPath(result);
				if (prefs.autoclose_vicinae) closeMainWindow();
			} else {
				setLastCapture(result);
			}
		}
		setFinished(true);
	};

	useEffect(() => {
		Promise.all([
			resolveBackend(prefs.screenshot_tool ?? "auto", "window"),
			resolveAnnotator(prefs.annotation_tool ?? "auto"),
		]).then(([backend, annotator]) => {
			const bid = backend?.id ?? null;
			setActiveBackendId(bid);
			setActiveAnnotatorId(annotator?.id ?? null);
			if (!bid) return;
			if (backend?.captureRegion) {
				setWindows(listWindows());
			} else {
				capture(bid);
			}
		});
	}, []);

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;

	const handleSave = () => {
		if (!lastCapture) return;
		const destination = getSavePath(prefs);
		saveImageFile(lastCapture, destination);
		setSavedPath(destination);
		setLastCapture(null);
		if (prefs.autoclose_vicinae) closeMainWindow();
	};

	const handleAnnotate = async () => {
		if (!lastCapture || !activeAnnotatorId) return;
		const shouldReload = await annotateWith(lastCapture, activeAnnotatorId);
		if (shouldReload) refreshPreview();
	};

	const captureRegion = Boolean(
		activeBackendId && getBackend(activeBackendId)?.captureRegion,
	);

	/** Back to the window list when there is one, otherwise back to the tool. */
	const reshoot = () => {
		setLastCapture(null);
		if (captureRegion) {
			setWindows(listWindows());
		} else if (activeBackendId) {
			capture(activeBackendId);
		}
	};

	if (!lastCapture) {
		if (discarded) {
			return <Detail markdown="## Screenshot discarded" />;
		}
		if (savedPath) {
			return (
				<Detail markdown={`## Screenshot saved\n\n\`${savedPath}\``} />
			);
		}
		if (windows === null) {
			return (
				<Detail
					markdown={
						finished
							? "## No screenshot captured\n\nThe selection was cancelled, or the capture tool reported an error."
							: activeBackendId
								? "## Capturing...\n\nThe active window will be captured."
								: "## Loading...\n\nLooking for windows."
					}
				/>
			);
		}
	}

	if (!lastCapture && windows !== null) {
		return (
			<List
				navigationTitle="Capture Window"
				searchBarPlaceholder="Search windows..."
				actions={
					<ActionPanel>
						<Action
							title="Refresh Windows"
							icon={Icon.ArrowClockwise}
							onAction={() => setWindows(listWindows())}
						/>
					</ActionPanel>
				}
			>
				<List.EmptyView
					icon={Icon.AppWindow}
					title="No windows on this workspace"
					description="Switch to a workspace with a window, then refresh."
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
										onAction={() => {
											if (activeBackendId) capture(activeBackendId, target.geometry);
										}}
									/>
									<Action
										title="Refresh Windows"
										icon={Icon.ArrowClockwise}
										onAction={() => setWindows(listWindows())}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			</List>
		);
	}

	// Both branches above return for every state without a capture; this is the
	// remaining one, and it has a file to show.
	if (!lastCapture) return null;

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
			onReshoot={reshoot}
			onDiscard={() => {
				removeTempCapture();
				setDiscarded(true);
				setLastCapture(null);
			}}
		/>
	);
}
