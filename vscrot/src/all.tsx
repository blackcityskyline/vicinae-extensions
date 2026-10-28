import { useState, useEffect } from "react";
import { Detail, closeMainWindow } from "@vicinae/api";
import { getPrefs, isNativeHandoff } from "./lib/preferences";
import { getSavePath, saveImageFile } from "./lib/filesystem";
import { formatDateTokens } from "./lib/dateFormat";
import {
	TEMP_PATH,
	removeTempCapture,
} from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { applyAnnotationFlow, annotateWith } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getAnnotator } from "./annotators";
import { pickAnnotator, resolveBackend, resolveAnnotator } from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";

export default function CaptureAll() {
	const prefs = getPrefs();
	const [lastCapture, setLastCapture] = useState<string | null>(null);
	const [finished, setFinished] = useState(false);
	const [savedPath, setSavedPath] = useState<string | null>(null);
	const [discarded, setDiscarded] = useState(false);
	const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		null,
	);

	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	const capture = async (backendId: string, annotatorId: string | null) => {
		setFinished(false);
		const result = await captureScreenshot("full", backendId);
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

		const flow = prefs.annotation_flow ?? "after_capture";
		if (flow === "after_capture") {
			await applyAnnotationFlow(result, prefs, annotatorId);
		}

		copyToClipboard(result, prefs.autoclose_vicinae);
		const savedPath = saveImageFile(result, getSavePath(prefs));
		let preview = savedPath;
		if (flow === "notify") {
			const notified = await applyAnnotationFlow(result, prefs, annotatorId, savedPath);
			if (notified) preview = notified;
		}
		if (flow === "off") preview = savedPath;

		setLastCapture(preview);
		setFinished(true);
	};

	useEffect(() => {
		Promise.all([
			resolveBackend(prefs, "full"),
			resolveAnnotator(prefs),
		]).then(([backend, annotator]) => {
			const bid = backend?.id ?? null;
			setActiveBackendId(bid);
			setActiveAnnotatorId(annotator?.id ?? null);
			if (bid) capture(bid, annotator?.id ?? null);
		});
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

	if (!lastCapture) {
		if (discarded) {
			return <Detail markdown="## Screenshot discarded" />;
		}
		if (savedPath) {
			return (
				<Detail markdown={`## Screenshot saved\n\n\`${savedPath}\``} />
			);
		}
		return (
			<Detail
				markdown={
					finished
						? "## No screenshot captured\n\nThe selection was cancelled, or the capture tool reported an error."
						: "## Capturing...\n\nCapturing every monitor."
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
			onReshoot={() => {
				setLastCapture(null);
				if (activeBackendId) capture(activeBackendId, activeAnnotatorId);
			}}
			onDiscard={() => {
				removeTempCapture();
				setDiscarded(true);
				setLastCapture(null);
			}}
		/>
	);
}
