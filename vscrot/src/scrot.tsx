import { useState, useEffect, useMemo } from "react";
import { existsSync } from "node:fs";
import { closeMainWindow, showHUD, trash } from "@vicinae/api";
import { getPrefs, expandPath, isNativeHandoff } from "./lib/preferences";
import { formatDateTokens } from "./lib/dateFormat";
import {
	TEMP_PATH,
	getSavePath,
	loadRecentFiles,
	saveImageFile,
} from "./lib/filesystem";
import { copyToClipboard } from "./lib/clipboard";
import { annotateWith, applyAnnotationFlow } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { getBackend } from "./backends";
import { getAnnotator } from "./annotators";
import {
	getInstalledBackends,
	getInstalledAnnotators,
	pickAnnotator,
	resolveBackend,
	resolveAnnotator,
	saveBackendChoice,
	saveAnnotatorChoice,
} from "./lib/tool-selection";
import { PreviewDetail } from "./components/PreviewDetail";
import { CaptureList } from "./components/CaptureList";
import type { CaptureMode } from "./backends/types";

export default function Scrot() {
	const prefs = getPrefs();
	const saveDirBase = expandPath(
		prefs.screenshot_path || "~/Pictures/Screenshots",
	);

	// Detected synchronously at startup - stable across renders
	const installedBackends = useMemo(() => getInstalledBackends(), []);
	const installedAnnotators = useMemo(() => getInstalledAnnotators(), []);

	const [recentFiles, setRecentFiles] = useState<string[]>([]);
	const [lastCapture, setLastCapture] = useState<string | null>(null);

	// Sync initial guess from prefs so first render is instant, then
	// useEffect async-corrects from LocalStorage if a saved choice exists.
	const [activeBackendId, setActiveBackendId] = useState<string | null>(() => {
		const b = getBackend(prefs.screenshot_tool ?? "auto", prefs.capture_order ?? "");
		return b?.isAvailable() ? b.id : (installedBackends[0]?.id ?? null);
	});
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		() => pickAnnotator(prefs)?.id ?? null,
	);

	const refreshRecent = () => setRecentFiles(loadRecentFiles(saveDirBase));
	const refreshPreview = () => {
		setLastCapture(null);
		setTimeout(() => setLastCapture(TEMP_PATH), 100);
	};

	useEffect(() => {
		refreshRecent();
		resolveBackend(prefs).then((b) => {
			if (b) setActiveBackendId(b.id);
		});
		resolveAnnotator(prefs).then((a) => {
			if (a) setActiveAnnotatorId(a.id);
		});
	}, []);

	const activeBackend = activeBackendId ? getBackend(activeBackendId) : null;
	const supportedModes: CaptureMode[] = activeBackend?.supportedModes ?? [
		"area",
		"window",
		"monitor",
		"full",
	];

	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;
	const annotatorLabel =
		activeAnnotator && activeAnnotator.id !== "none"
			? `Annotate (${activeAnnotator.displayName})`
			: null;

	const capture = async (mode: CaptureMode) => {
		if (!activeBackendId) return;
		const result = await captureScreenshot(mode, activeBackendId);
		if (!result) return;

		// In native hand-off the desktop tool already wrote the screenshot to the
		// save directory and owns the notification pointing at it. Running the
		// Vicinae pipeline over it would save a second copy under a fresh
		// timestamp and show the preview the preference promises to skip.
		if (isNativeHandoff()) {
			copyToClipboard(result, false);
			refreshRecent();
			if (prefs.autoclose_vicinae) closeMainWindow();
			return;
		}

		const flow = prefs.annotation_flow ?? "after_capture";

		// Tools that rewrite the file in place run before delivery, so the copy
		// and the save carry the annotated bytes.
		if (flow === "after_capture") {
			await applyAnnotationFlow(result, prefs, activeAnnotatorId);
		}

		// Auto-save and auto-copy are always on.
		await copyToClipboard(result, false);
		let savedPath: string | null = saveImageFile(result, getSavePath(prefs));
		refreshRecent();

		// The notification's button runs the annotator after this command may be
		// gone, so it points at a file on disk, not at the temp capture.
		if (flow === "notify") {
			// The notification needs a file that outlives the command; the save it
			// makes removes the temp capture, and that copy is what remains.
			const notified = await applyAnnotationFlow(
				result,
				prefs,
				activeAnnotatorId,
				savedPath,
			);
			if (notified) savedPath = notified;
		}

		// Close if autoclose is on and at least one auto-action ran
		if (
			(prefs.copy_to_clipboard || prefs.save_to_file) &&
			prefs.autoclose_vicinae
		) {
			closeMainWindow();
			return;
		}

		// Saving consumes the temp capture; the preview must not point at a file
		// that was just removed.
		setLastCapture(existsSync(result) ? result : savedPath);
	};


	const handleAnnotate = async () => {
		if (!lastCapture) return;
		const annotator = pickAnnotator(prefs, activeAnnotatorId);
		if (!annotator) return;
		const shouldReload = await annotateWith(lastCapture, annotator);
		if (shouldReload) refreshPreview();
	};

	const handleSelectBackend = async (id: string) => {
		await saveBackendChoice(id);
		setActiveBackendId(id);
	};

	const handleSelectAnnotator = async (id: string) => {
		await saveAnnotatorChoice(id);
		setActiveAnnotatorId(id);
	};

	const handleDeleteFile = async (filePath: string) => {
		try {
			await trash(filePath);
		} catch (e) {
			console.error("Failed to move screenshot to trash", e);
			showHUD("Could not move the screenshot to the trash");
			return;
		}
		refreshRecent();
	};

	if (lastCapture) {
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
					capture("area");
				}}
				onDiscard={() => setLastCapture(null)}
			/>
		);
	}

	return (
		<CaptureList
			recentFiles={recentFiles}
			supportedModes={supportedModes}
			activeBackend={activeBackend}
			activeAnnotator={activeAnnotator}
			installedBackends={installedBackends}
			installedAnnotators={installedAnnotators}
			onCapture={capture}
			onRefresh={refreshRecent}
			onCopyFile={copyToClipboard}
			onDeleteFile={handleDeleteFile}
			onSelectBackend={handleSelectBackend}
			onSelectAnnotator={handleSelectAnnotator}
		/>
	);
}
