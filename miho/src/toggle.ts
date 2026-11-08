import { Toast, showToast } from "@vicinae/api";

import { readStatus, notifyFailure, startMihomo, stopMihomo } from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";

export default async function ToggleCommand() {
	const status = await readStatus();
	const toast = await showToast({
		style: Toast.Style.Animated,
		title: status.running ? "Stopping mihomo" : "Starting mihomo",
	});
	try {
		const message = status.running ? await stopMihomo() : await startMihomo(status.mode);
		toast.style = Toast.Style.Success;
		toast.title = message;
	} catch (cause) {
		const message = errorText(cause);
		toast.style = Toast.Style.Failure;
		toast.title = status.running ? "Stopping mihomo failed" : "Starting mihomo failed";
		toast.message = message;
		await notifyFailure(`Miho: ${toast.title}`, message);
	}
}
