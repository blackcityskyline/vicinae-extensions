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
	stopRecording,
	getOutputPathFromProcess,
	getLatestFileInDirectory,
} from "./recorder";

interface Preferences {
	"open-after-stop-recording": boolean;
}

const cache = new Cache({ namespace: "settings" });

/** The form's checkbox wins; the manifest preference is the first-run default. */
function openAfterStop(preference: boolean): boolean {
	try {
		const data = cache.get("settings");
		if (data) return JSON.parse(data).openAfterStop ?? preference;
	} catch {
		// ignore
	}
	return preference;
}

export default async function StopRecording() {
	const status = await getRecorderStatus();

	if (status === "idle") {
		await showToast({
			style: Toast.Style.Failure,
			title: "Not active",
			message: "No recording or instant replay to stop",
		});
		return;
	}

	const outputInfo = await getOutputPathFromProcess();
	const result = await stopRecording();

	if (result.success) {
		const preferences = getPreferenceValues<Preferences>();
		if (openAfterStop(preferences["open-after-stop-recording"]) && outputInfo) {
			if (status === "recording") {
				await new Promise((resolve) => setTimeout(resolve, 1000));
				const latestFile = await getLatestFileInDirectory(outputInfo.directory);
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
					status === "recording" ? "Recording saved" : "Instant replay stopped",
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
