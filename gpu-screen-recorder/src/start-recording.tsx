import {
	showToast,
	Toast,
	getPreferenceValues,
	Cache,
	closeMainWindow,
} from "@vicinae/api";
import {
	getRecorderStatus,
	audioSourcesFromStored,
	startRecording,
	type RecorderOptions,
	type QualityPreset,
	type CaptureSource,
} from "./recorder";

interface Preferences {
	"default-monitor": string;
	"default-replay-buffer-size": string;
	"quality-preset": QualityPreset;
	"audio-input": string;
	"save-location": string;
}

interface CachedSettings {
	captureSourceType: "current-monitor" | "monitor" | "window";
	monitorId: string;
	quality: QualityPreset;
	audioSources: string[];
	saveLocation: string;
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

export default async function StartRecording() {
	const status = await getRecorderStatus();

	if (status !== "idle") {
		if (status === "recording") {
			await showToast({
				style: Toast.Style.Failure,
				title: "Already recording",
				message: "Stop the current recording first",
			});
		} else {
			await showToast({
				style: Toast.Style.Failure,
				title: "Instant Replay is active",
				message: "Stop Instant Replay first to start recording",
			});
		}
		return;
	}

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
}
