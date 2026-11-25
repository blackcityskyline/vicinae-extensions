import {
	showToast,
	Toast,
	getPreferenceValues,
	Cache,
	closeMainWindow,
	showInFileBrowser,
} from "@vicinae/api";
import {
	getRecorderStatus,
	audioSourcesFromStored,
	startRecording,
	stopRecording,
	getOutputPathFromProcess,
	getLatestFileInDirectory,
	type RecorderOptions,
	type QualityPreset,
	type CaptureSource,
} from "./recorder";

interface Preferences {
	"default-monitor": string;
	"default-replay-buffer-size": string;
	"quality-preset": QualityPreset;
	"audio-input": string;
	"open-after-stop-recording": boolean;
}

interface CachedSettings {
	captureSourceType: "current-monitor" | "monitor" | "window";
	monitorId: string;
	quality: QualityPreset;
	audioSources: string[];
	saveLocation: string;
	openAfterStop?: boolean;
}

const DEFAULT_SETTINGS: CachedSettings = {
	captureSourceType: "current-monitor",
	monitorId: "",
	quality: "high",
	audioSources: [],
	saveLocation: `${process.env.HOME}/Videos`,
};

const cache = new Cache({ namespace: "settings" });

function loadSettings(): CachedSettings {
	try {
		const data = cache.get("settings");
		if (data) {
			const stored = JSON.parse(data);
			return {
				...DEFAULT_SETTINGS,
				...stored,
				audioSources: audioSourcesFromStored(stored),
			};
		}
	} catch {
		// ignore
	}
	return DEFAULT_SETTINGS;
}

function getOptions(): RecorderOptions {
	const prefs = getPreferenceValues<Preferences>();
	const settings = loadSettings();

	let captureSource: CaptureSource;
	if (settings.captureSourceType === "current-monitor") {
		captureSource = { type: "current-monitor" };
	} else if (settings.captureSourceType === "monitor") {
		captureSource = {
			type: "monitor",
			id: settings.monitorId || prefs["default-monitor"],
		};
	} else {
		captureSource = { type: "window" };
	}

	return {
		captureSource,
		quality: settings.quality,
		audioSources: settings.audioSources,
		saveLocation: settings.saveLocation || `${process.env.HOME}/Videos`,
	};
}

export default async function ToggleRecording() {
	const status = await getRecorderStatus();

	if (status === "idle") {
		const options = getOptions();
		const result = await startRecording(options);

		if (result.success) {
			await closeMainWindow();
		} else {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to start recording",
				message: result.error,
			});
		}
	} else {
		const outputInfo = await getOutputPathFromProcess();
		const prefs = getPreferenceValues<Preferences>();
		const settings = loadSettings();
		const openAfterStop =
			settings.openAfterStop ?? prefs["open-after-stop-recording"];
		const result = await stopRecording();

		if (result.success) {
			if (openAfterStop && outputInfo) {
				if (status === "recording") {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					const latestFile = await getLatestFileInDirectory(
						outputInfo.directory,
					);
					await showInFileBrowser(latestFile ?? outputInfo.directory, {
						select: true,
					});
				} else {
					await showInFileBrowser(outputInfo.directory, { select: true });
				}
				await closeMainWindow();
			} else {
				await showToast({
					style: Toast.Style.Success,
					title:
						status === "recording"
							? "Recording stopped"
							: "Instant Replay stopped",
					message:
						status === "recording"
							? "Recording saved"
							: "Instant replay stopped",
				});
			}
		} else {
			await showToast({
				style: Toast.Style.Failure,
				title: "Failed to stop",
				message: result.error,
			});
		}
	}
}
