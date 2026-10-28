import { exec } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { showHUD } from "@vicinae/api";
import { getBackendForMode } from "../../backends";
import { isCancellation } from "../../backends/errors";
import { stderrOf } from "../../backends/utils";
import { getPrefs } from "../preferences";

export const captureRegionWithBackend = async (outPath: string): Promise<boolean> => {
	const prefs = getPrefs();
	const backend = getBackendForMode(
		prefs.screenshot_tool ?? "auto",
		"area",
		prefs.capture_order ?? "",
	);

	if (!backend) {
		showHUD("No screenshot tool found for region capture. Install one and retry.");
		return false;
	}

	if (!backend.supportedModes.includes("area")) {
		showHUD(`${backend.displayName} does not support area capture`);
		return false;
	}

	const targetDir = dirname(outPath);
	try {
		mkdirSync(targetDir, { recursive: true });
	} catch {}

	const before = existsSync(outPath) ? statSync(outPath).mtimeMs : -1;

	try {
		if (existsSync(outPath)) unlinkSync(outPath);
		// Window already closed by caller; small delay to let compositor settle
		await new Promise((resolve) => setTimeout(resolve, 150));

		if (backend.captureRegion) {
			await backend.capture("area", outPath);
		} else {
			await backend.capture("area", outPath);
		}
		exec("vicinae open");

		if (!existsSync(outPath)) return false;
		const after = statSync(outPath).mtimeMs;
		if (after <= before) {
			try {
				if (statSync(outPath).size === 0) return false;
			} catch {}
			return false;
		}
		if (statSync(outPath).size === 0) return false;
		return true;
	} catch (e) {
		exec("vicinae open");
		if (isCancellation(e)) return false;
		const stderr = stderrOf(e);
		console.error("OCR capture failed:", stderr, e);
		const detail = stderr.split("\n").pop() || (e as Error).message;
		showHUD(`${backend.displayName} failed: ${detail}`);
		return false;
	}
};
