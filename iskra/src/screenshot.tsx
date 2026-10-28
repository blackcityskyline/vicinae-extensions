import { useEffect, useMemo, useState } from "react";
import { showHUD, trash } from "@vicinae/api";
import { getAnnotator } from "./annotators";
import { findBackend, getUsableBackends, pickBackend } from "./backends";
import { CaptureList } from "./components/CaptureList";
import { useCapture } from "./components/useCapture";
import { copyToClipboard } from "./lib/clipboard";
import { loadRecentFiles } from "./lib/filesystem";
import { expandPath, getPrefs } from "./lib/preferences";
import {
	getInstalledAnnotators,
	pickAnnotator,
	resolveAnnotator,
	resolveBackend,
	saveAnnotatorChoice,
	saveBackendChoice,
} from "./lib/tool-selection";

export default function Screenshot() {
	const prefs = getPrefs();
	const saveDirBase = expandPath(
		prefs.screenshot_path || "~/Pictures/Screenshots",
	);

	// Detected synchronously at startup - stable across renders
	const installedBackends = useMemo(() => getUsableBackends(), []);
	const installedAnnotators = useMemo(() => getInstalledAnnotators(), []);

	const [recentFiles, setRecentFiles] = useState<string[]>([]);

	// Sync initial guess from prefs so first render is instant, then
	// useEffect async-corrects from LocalStorage if a saved choice exists.
	const [activeBackendId, setActiveBackendId] = useState<string | null>(
		() =>
			pickBackend(prefs.screenshot_tool ?? "auto", prefs.capture_order ?? "")
				?.id ?? null,
	);
	const [activeAnnotatorId, setActiveAnnotatorId] = useState<string | null>(
		() => pickAnnotator(prefs)?.id ?? null,
	);

	const { phase, run, view } = useCapture();

	const refreshRecent = () => setRecentFiles(loadRecentFiles(saveDirBase));

	useEffect(() => {
		resolveBackend(prefs).then((b) => {
			if (b) setActiveBackendId(b.id);
		});
		resolveAnnotator(prefs).then((a) => {
			if (a) setActiveAnnotatorId(a.id);
		});
	}, []);

	// A capture, a discard and the first render all leave the list showing
	// whatever is on disk now.
	useEffect(refreshRecent, [phase]);

	const activeBackend = activeBackendId
		? (findBackend(activeBackendId) ?? null)
		: null;
	const supportedModes = activeBackend?.supportedModes ?? [
		"area",
		"window",
		"monitor",
		"full",
	];
	const activeAnnotator = activeAnnotatorId
		? getAnnotator(activeAnnotatorId)
		: null;

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

	if (view) return view;

	return (
		<CaptureList
			recentFiles={recentFiles}
			supportedModes={supportedModes}
			activeBackend={activeBackend}
			activeAnnotator={activeAnnotator}
			installedBackends={installedBackends}
			installedAnnotators={installedAnnotators}
			onCapture={(mode) => run(mode)}
			onRefresh={refreshRecent}
			onCopyFile={copyToClipboard}
			onDeleteFile={handleDeleteFile}
			onSelectBackend={async (id) => {
				await saveBackendChoice(id);
				setActiveBackendId(id);
			}}
			onSelectAnnotator={async (id) => {
				await saveAnnotatorChoice(id);
				setActiveAnnotatorId(id);
			}}
		/>
	);
}
