import { exec } from "child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "util";

const execAsync = promisify(exec);

/** The recorder writes here instead of to the worker, whose life is short. */
const LOG_PATH = join(tmpdir(), "gpu-screen-recorder.log");

export type RecorderMode = "idle" | "recording" | "instant-replay";

export type CaptureSource =
	| { type: "current-monitor" }
	| { type: "monitor"; id: string }
	| { type: "window" };

export type QualityPreset = "medium" | "high" | "very_high" | "ultra";

export interface RecorderOptions {
	captureSource: CaptureSource;
	quality: QualityPreset;
	audioInput?: string;
	saveLocation: string;
	bufferSize?: number;
	gsrPath?: string;
}

function getGsrPath(customPath?: string): string {
	return customPath || "gpu-screen-recorder";
}

async function getMonitorResolution(
	monitorId?: string,
	gsrPath?: string,
): Promise<string | null> {
	try {
		const cmd = `${getGsrPath(gsrPath)} --list-monitors 2>/dev/null || true`;
		const { stdout } = await execAsync(cmd);
		const lines = stdout.trim().split("\n");
		for (const line of lines) {
			const [id, res] = line.split("|");
			if (monitorId && id === monitorId) {
				return res;
			}
			if (!monitorId && id) {
				return res;
			}
		}
		return null;
	} catch {
		return null;
	}
}

async function getCurrentMonitor(): Promise<string | null> {
	try {
		const hyprland = await checkHyprland();
		if (hyprland) {
			const { stdout } = await execAsync("hyprctl monitors -j 2>/dev/null");
			const monitors = JSON.parse(stdout);
			if (monitors && monitors.length > 0) {
				const focused = monitors.find((m: { focused: boolean }) => m.focused);
				const monitor = focused || monitors[0];
				return monitor.name;
			}
		}

		const niri = await checkNiri();
		if (niri) {
			const { stdout } = await execAsync(
				"niri msg -j focused-output | jq -r .name 2>/dev/null",
			);
			if (stdout.trim()) return stdout.trim();
		}

		const sway = await checkSway();
		if (sway) {
			const { stdout } = await execAsync(
				"swaymsg -t get_outputs | jq -r '.[] | select(.focused) | .name' 2>/dev/null",
			);
			if (stdout.trim()) return stdout.trim();
		}

		const { stdout } = await execAsync(
			"gpu-screen-recorder --list-monitors 2>/dev/null | head -1",
		);
		const line = stdout.trim().split("\n")[0];
		if (line && line.includes("|")) {
			return line.split("|")[0];
		}

		return null;
	} catch {
		return null;
	}
}

function buildCaptureArg(source: CaptureSource): {
	target: string | undefined;
	size?: string;
} {
	switch (source.type) {
		case "current-monitor":
			return { target: undefined };
		case "monitor":
			return { target: source.id };
		case "window":
			return { target: "portal" };
	}
}

export async function buildRecordingCommand(
	options: RecorderOptions,
): Promise<string> {
	let { target } = buildCaptureArg(options.captureSource);
	if (options.captureSource.type === "current-monitor") {
		target = (await getCurrentMonitor()) || undefined;
	}
	if (!target) {
		throw new Error(
			"No capture target specified. Please select a monitor or window.",
		);
	}
	let resolution: string | null = null;
	resolution = await getMonitorResolution(target, options.gsrPath);
	const sizeArg = resolution ? `-s ${resolution}` : "";
	const audioArg = options.audioInput ? `-a "${options.audioInput}"` : "";
	const outputPath = `${options.saveLocation}/$(date +%Y-%m-%d_%H-%M-%S).mp4`;
	const gsr = getGsrPath(options.gsrPath);

	return `${gsr} -w ${target} ${sizeArg} -c mp4 -q ${options.quality} ${audioArg} -f 60 -df no -o "${outputPath}"`;
}

export async function buildInstantReplayCommand(
	options: RecorderOptions,
): Promise<string> {
	if (!options.bufferSize) {
		throw new Error("Buffer size is required for instant replay");
	}
	let { target } = buildCaptureArg(options.captureSource);
	if (options.captureSource.type === "current-monitor") {
		target = (await getCurrentMonitor()) || undefined;
	}
	if (!target) {
		throw new Error(
			"No capture target specified. Please select a monitor or window.",
		);
	}
	let resolution: string | null = null;
	resolution = await getMonitorResolution(target, options.gsrPath);
	const sizeArg = resolution ? `-s ${resolution}` : "";
	const audioArg = options.audioInput ? `-a "${options.audioInput}"` : "";
	const outputDir = `"${options.saveLocation}"`;
	const gsr = getGsrPath(options.gsrPath);

	return `${gsr} -w ${target} ${sizeArg} -c mp4 -q ${options.quality} ${audioArg} -f 60 -r ${options.bufferSize} -df no -o ${outputDir}`;
}

export interface AudioDevice {
	id: string;
	name: string;
}

export async function getAudioDevices(
	gsrPath?: string,
): Promise<AudioDevice[]> {
	try {
		const gsr = getGsrPath(gsrPath);
		const { stdout } = await execAsync(
			`${gsr} --list-audio-devices 2>/dev/null || echo ''`,
		);
		const devices: AudioDevice[] = [];
		for (const line of stdout.trim().split("\n")) {
			if (!line) continue;
			const [id, ...nameParts] = line.split("|");
			if (id && nameParts.length > 0) {
				devices.push({ id, name: nameParts.join("|") });
			}
		}
		return devices;
	} catch {
		return [];
	}
}

export interface ApplicationAudio {
	id: string;
	name: string;
}

export async function getApplicationAudio(
	gsrPath?: string,
): Promise<ApplicationAudio[]> {
	try {
		const gsr = getGsrPath(gsrPath);
		const { stdout } = await execAsync(
			`${gsr} --list-application-audio 2>/dev/null || echo ''`,
		);
		const apps: ApplicationAudio[] = [];
		for (const line of stdout.trim().split("\n")) {
			if (!line || line.includes("|")) continue;
			const name = line.trim();
			if (name) {
				apps.push({ id: name, name });
			}
		}
		return apps;
	} catch {
		return [];
	}
}

export interface Monitor {
	id: string;
	resolution: string;
}

export async function getMonitors(gsrPath?: string): Promise<Monitor[]> {
	try {
		const gsr = getGsrPath(gsrPath);
		const { stdout } = await execAsync(
			`${gsr} --list-monitors 2>/dev/null || echo ''`,
		);
		const monitors: Monitor[] = [];
		for (const line of stdout.trim().split("\n")) {
			if (!line || !line.includes("|")) continue;
			const [id, resolution] = line.split("|");
			if (id && resolution) {
				monitors.push({ id, resolution });
			}
		}
		return monitors;
	} catch {
		return [];
	}
}

/** Why the recorder went nowhere: the clearest error it wrote, or its last word. */
function failureReason(): string {
	try {
		const lines = readFileSync(LOG_PATH, "utf8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		// gsr ends with a bare "gsr_capture_start failed"; the cause is the
		// longest of the errors above it.
		const error = lines
			.filter((line) => line.includes("error:"))
			.reduce((longest, line) => (line.length > longest.length ? line : longest), "");
		return (error || lines[lines.length - 1] || "gpu-screen-recorder stopped at once").replace(
			/^gsr error: /,
			"",
		);
	} catch {
		return "gpu-screen-recorder stopped at once";
	}
}

/**
 * Starts the recorder in a session of its own and answers whether it is still
 * running. A no-view command's worker is torn down as soon as it answers, and
 * `nohup` only ignores SIGHUP — the recorder rides in the worker's process
 * group, so the teardown took it down while the toast said the recording had
 * started. `detached` gives it its own group, and the answer comes from the
 * recorder's state instead of the shell's exit code.
 */
function startDetached(
	command: string,
): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		const fullCommand = `env WAYLAND_DISPLAY="$WAYLAND_DISPLAY" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" ${command} > "${LOG_PATH}" 2>&1 &`;
		exec(fullCommand, { detached: true }, () => {
			setTimeout(async () => {
				if (await isRecordingActive()) {
					resolve({ success: true });
				} else {
					resolve({ success: false, error: failureReason() });
				}
			}, 700);
		});
	});
}

export async function startRecording(
	options: RecorderOptions,
): Promise<{ success: boolean; error?: string }> {
	const result = await startDetached(await buildRecordingCommand(options));
	if (!result.success && options.captureSource.type === "window") {
		// The portal picks the window with a dialog, and a command with no window
		// on screen has nothing to answer it with.
		return {
			...result,
			error: `Window capture needs the portal's picker, which a command cannot show. Choose a monitor: ${result.error}`,
		};
	}
	return result;
}

export async function startInstantReplay(
	options: RecorderOptions,
): Promise<{ success: boolean; error?: string }> {
	return startDetached(await buildInstantReplayCommand(options));
}

export async function getOutputPathFromProcess(): Promise<{
	path: string;
	isFile: boolean;
	directory: string;
} | null> {
	try {
		const { stdout: pidOutput } = await execAsync(
			"pidof gpu-screen-recorder 2>/dev/null || true",
		);
		const pid = pidOutput.trim();
		if (!pid) return null;

		const { stdout } = await execAsync(
			`ps -p ${pid} -o args= 2>/dev/null || echo ""`,
		);
		const args = stdout.trim();
		if (!args) return null;

		const parts = args.match(/-o\s+"?([^\s"]+)"?/);
		if (!parts || !parts[1]) return null;

		const output = parts[1];
		if (output.endsWith(".mp4")) {
			const dir = output.substring(0, output.lastIndexOf("/"));
			return { path: output, isFile: true, directory: dir };
		}
		return { path: output, isFile: false, directory: output };
	} catch {
		return null;
	}
}

export async function getLatestFileInDirectory(
	dirPath: string,
): Promise<string | null> {
	try {
		const { stdout } = await execAsync(
			`ls -t "${dirPath}"/*.mp4 2>/dev/null | head -1`,
		);
		const file = stdout.trim();
		return file || null;
	} catch {
		return null;
	}
}

export async function saveInstantReplay(): Promise<{
	success: boolean;
	error?: string;
}> {
	return new Promise((resolve) => {
		const command =
			"pkill -SIGUSR1 gpu-screen-recorder 2>/dev/null || killall -SIGUSR1 gpu-screen-recorder 2>/dev/null || true";
		exec(command, (error) => {
			if (error) {
				console.error("Save replay error:", error.message);
				resolve({ success: false, error: error.message });
			} else {
				console.log("Replay saved successfully");
				resolve({ success: true });
			}
		});
	});
}

export async function stopRecording(): Promise<{
	success: boolean;
	error?: string;
}> {
	try {
		exec(
			"pkill -INT gpu-screen-recorder 2>/dev/null || killall -INT gpu-screen-recorder 2>/dev/null || kill $(pidof gpu-screen-recorder) 2>/dev/null || true",
		);
		return { success: true };
	} catch (error) {
		return { success: false, error: String(error) };
	}
}

export async function getRecorderStatus(): Promise<RecorderMode> {
	try {
		const { stdout: pidOutput } = await execAsync(
			"pidof gpu-screen-recorder 2>/dev/null || true",
		);
		const pid = pidOutput.trim();
		if (!pid) {
			return "idle";
		}
		const { stdout } = await execAsync(
			`ps -p ${pid} -o args= 2>/dev/null || echo ""`,
		);
		if (stdout.includes("-r ") || stdout.includes("--replay")) {
			return "instant-replay";
		}
		return "recording";
	} catch {
		return "idle";
	}
}

export async function isRecordingActive(): Promise<boolean> {
	const status = await getRecorderStatus();
	return status !== "idle";
}

async function checkHyprland(): Promise<boolean> {
	try {
		await execAsync("hyprctl version");
		return true;
	} catch {
		return false;
	}
}

async function checkNiri(): Promise<boolean> {
	try {
		await execAsync("niri msg version");
		return true;
	} catch {
		return false;
	}
}

async function checkSway(): Promise<boolean> {
	try {
		await execAsync("swaymsg -t get_version");
		return true;
	} catch {
		return false;
	}
}
