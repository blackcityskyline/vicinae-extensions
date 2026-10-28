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
import { listWindows, type WindowTarget } from "./lib/hypr-windows";
import { getBackend } from "./backends";
import { getAnnotator } from "./annotators";
import { pickAnnotator, resolveBackend, resolveAnnotator } from "./lib/tool-selection";
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
	const [windows, setWindows] = useState<WindowTarget[]>([]);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	/**
	 * `geometry` is the box of a window named in the list. Without it the capture
	 * tool shows its own picker over the desktop, which is the same choice made
	 * with the cursor instead of the keyboard.
	 */
	const capture = async (
		backendId: string,
		annotatorId: string | null,
		geometry?: string,
	) => {
		setFinished(false);
		const result = await captureScreenshot(
			"window",
			backendId,
			0,
			undefined,
			geometry,
		);
		if (!result) {
			setFinished(true);
			return;
		}

		// In native hand-off the desktop tool owns the result: it is already
		// saved where the user wants it, so Vicinae reports rather than previews.
		if (isNativeHandoff()) {
			copyToClipboard(result, prefs.autoclose_vicinae);
			setSavedPath(result);
			if (prefs.autoclose_vicinae) closeMainWindow();
			setFinished(true);
			return;
		}

		// A window capture is a finished screenshot, so the configured step after
		// capture — annotate now, notify, or nothing — belongs here too.
		const flow = prefs.annotation_flow ?? "after_capture";
		if (flow === "after_capture") {
			await applyAnnotationFlow(result, prefs, annotatorId);
		}

		// Auto-save and auto-copy are always on.
		copyToClipboard(result, prefs.autoclose_vicinae);
		const savedPath = saveImageFile(result, getSavePath(prefs));

		let preview = savedPath;
		if (flow === "notify") {
			const notified = await applyAnnotationFlow(result, prefs, annotatorId, savedPath);
			if (notified) preview = notified;
		}
		const finalPreview = preview;

		// A notify flow saves the capture and removes the temp file behind it, so
		// the preview has to point at what the flow left on disk.
		setLastCapture(finalPreview);
		setFinished(true);
	};

	useEffect(() => {
		Promise.all([resolveBackend(prefs, "window"), resolveAnnotator(prefs)]).then(
			([backend, annotator]) => {
				const bid = backend?.id ?? null;
				setActiveBackendId(bid);
				setActiveAnnotatorId(annotator?.id ?? null);
				if (!bid) return;
				if (backend?.captureRegion) {
					setWindows(listWindows());
				} else {
					capture(bid, annotator?.id ?? null);
				}
			},
		);
	}, []);

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;


	const handleAnnotate = async () => {
		if (!lastCapture) return;
		const annotator = pickAnnotator(prefs, activeAnnotatorId);
		if (!annotator) return;
		const shouldReload = await annotateWith(lastCapture, annotator);
		if (shouldReload) refreshPreview();
	};

	const canPickByTitle = Boolean(
		activeBackendId && getBackend(activeBackendId)?.captureRegion,
	);

	const pickWithCursor = () => {
		if (activeBackendId) capture(activeBackendId, activeAnnotatorId);
	};

	const reshoot = () => {
		setLastCapture(null);
		if (canPickByTitle) setWindows(listWindows());
		else pickWithCursor();
	};

	if (!lastCapture) {
		if (discarded) {
			return <Detail markdown="## Iskra discarded" />;
		}
		if (savedPath) {
			return (
				<Detail markdown={`## Iskra saved\n\n\`${savedPath}\``} />
			);
		}

		const cursorAction = activeBackendId ? (
			<Action
				title="Pick with Cursor"
				icon={Icon.Mouse}
				onAction={pickWithCursor}
			/>
		) : null;

		if (canPickByTitle) {
			return (
				<List
					navigationTitle="Capture Window"
					searchBarPlaceholder="Search windows..."
					actions={
						<ActionPanel>
							{cursorAction}
							<Action
								title="Refresh Windows"
								icon={Icon.ArrowClockwise}
								shortcut={{ modifiers: ["ctrl"], key: "r" }}
								onAction={() => setWindows(listWindows())}
							/>
						</ActionPanel>
					}
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
											onAction={() => {
												if (activeBackendId) {
													capture(
														activeBackendId,
														activeAnnotatorId,
														target.geometry,
													);
												}
											}}
										/>
										{cursorAction}
										<Action
											title="Refresh Windows"
											icon={Icon.ArrowClockwise}
											shortcut={{ modifiers: ["ctrl"], key: "r" }}
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

		return (
			<Detail
				markdown={
					finished
						? "## No screenshot captured\n\nThe selection was cancelled, or the capture tool reported an error."
						: activeBackendId
							? "## Capturing...\n\nThe active window will be captured."
							: "## Loading...\n\nLooking for a screenshot tool."
				}
			/>
		);
	}

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
