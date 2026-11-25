import { useState, useEffect, useCallback, useMemo } from "react";
import {
	ActionPanel,
	Action,
	Form,
	showToast,
	Toast,
	Icon,
	Cache,
	Keyboard,
	getPreferenceValues,
	closeMainWindow,
	open,
	showInFileBrowser,
} from "@vicinae/api";
import {
	type RecorderMode,
	type CaptureSource,
	type QualityPreset,
	type RecorderOptions,
	getRecorderStatus,
	startRecording,
	stopRecording,
	startInstantReplay,
	saveInstantReplay,
	getAudioDevices,
	getApplicationAudio,
	getMonitors,
	getLatestFileInDirectory,
	getOutputPathFromProcess,
	audioSourcesFromStored,
	isOutputDevice,
	toggleAudioSource,
} from "./recorder";

type Mode = "recording" | "instant-replay";

interface Preferences {
	"gsr-path": string;
	"open-after-save-replay": boolean;
	"open-after-stop-recording": boolean;
}

interface CachedSettings {
	mode: Mode;
	captureSourceType: "current-monitor" | "monitor" | "window";
	monitorId: string;
	resolution: string;
	quality: QualityPreset;
	audioSources: string[];
	saveLocation: string;
	bufferSize: number;
	openAfterReplay?: boolean;
	openAfterStop?: boolean;
}

const DEFAULT_SETTINGS: CachedSettings = {
	mode: "recording",
	captureSourceType: "current-monitor",
	monitorId: "",
	resolution: "",
	quality: "high",
	audioSources: [],
	saveLocation: `${process.env.HOME}/Videos`,
	bufferSize: 0,
};

const cache = new Cache({ namespace: "settings" });

/** The dropdown's own row: the control shows the picked sources, not one item. */
const AUDIO_SUMMARY = "__summary__";
/** Clears every audio source. */
const AUDIO_NONE = "__none__";

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

function saveSettings(settings: CachedSettings): void {
	cache.set("settings", JSON.stringify(settings));
}

function StatusDisplay({ mode }: { mode: RecorderMode }) {
	const statusText: Record<RecorderMode, string> = {
		idle: "Idle",
		recording: "Recording",
		"instant-replay": "Instant Replay",
	};

	return <Form.Description title="Status" text={statusText[mode]} />;
}

export default function MainView() {
	const initialSettings = useMemo(() => {
		const settings = loadSettings();
		const preferences = getPreferenceValues<Preferences>();
		return {
			...settings,
			openAfterReplay:
				settings.openAfterReplay ?? preferences["open-after-save-replay"],
			openAfterStop:
				settings.openAfterStop ?? preferences["open-after-stop-recording"],
		};
	}, []);

	const [mode, setMode] = useState<Mode>(initialSettings.mode);
	const [status, setStatus] = useState<RecorderMode>("idle");
	const [isLoading, setIsLoading] = useState(true);

	const [captureSourceType, setCaptureSourceType] = useState<
		"current-monitor" | "monitor" | "window"
	>(initialSettings.captureSourceType);
	const [monitorId, setMonitorId] = useState(initialSettings.monitorId);
	const [resolution, setResolution] = useState(initialSettings.resolution);
	const [quality, setQuality] = useState<QualityPreset>(
		initialSettings.quality,
	);
	const [audioSources, setAudioSources] = useState<string[]>(
		initialSettings.audioSources,
	);
	const [saveLocation, setSaveLocation] = useState(
		initialSettings.saveLocation,
	);
	const [bufferSize, setBufferSize] = useState(initialSettings.bufferSize);
	const [audioDevices, setAudioDevices] = useState<
		Array<{ id: string; name: string }>
	>([]);
	const [appAudio, setAppAudio] = useState<Array<{ id: string; name: string }>>(
		[],
	);
	const [monitors, setMonitors] = useState<
		Array<{ id: string; resolution: string }>
	>([]);
	const [openAfterReplay, setOpenAfterReplay] = useState(
		initialSettings.openAfterReplay,
	);
	const [openAfterStop, setOpenAfterStop] = useState(
		initialSettings.openAfterStop,
	);

	const fetchStatus = useCallback(async () => {
		const currentStatus = await getRecorderStatus();
		setStatus(currentStatus);
		if (currentStatus === "instant-replay") {
			setMode("instant-replay");
		}
		setIsLoading(false);
	}, []);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 1000);
		return () => clearInterval(interval);
	}, [fetchStatus]);

	useEffect(() => {
		async function fetchAudio() {
			const preferences = getPreferenceValues<Preferences>();
			const gsrPath = preferences["gsr-path"] || undefined;
			const [devices, apps, monitorList] = await Promise.all([
				getAudioDevices(gsrPath),
				getApplicationAudio(gsrPath),
				getMonitors(gsrPath),
			]);
			setAudioDevices(devices);
			setAppAudio(apps);
			setMonitors(monitorList);
			if (monitorList.length > 0 && !initialSettings.monitorId) {
				setMonitorId(monitorList[0].id);
				setResolution(monitorList[0].resolution);
			}
		}
		fetchAudio();
	}, []);

	const currentSettings = useMemo(
		(): CachedSettings => ({
			mode,
			captureSourceType,
			monitorId,
			resolution,
			quality,
			audioSources,
			saveLocation,
			bufferSize,
			openAfterReplay,
			openAfterStop,
		}),
		[
			mode,
			captureSourceType,
			monitorId,
			resolution,
			quality,
			audioSources,
			saveLocation,
			bufferSize,
			openAfterReplay,
			openAfterStop,
		],
	);

	const updateSetting = useCallback(
		(key: keyof CachedSettings, value: unknown) => {
			switch (key) {
				case "mode":
					setMode(value as Mode);
					break;
				case "captureSourceType":
					setCaptureSourceType(
						value as "current-monitor" | "monitor" | "window",
					);
					break;
				case "monitorId":
					setMonitorId(value as string);
					break;
				case "resolution":
					setResolution(value as string);
					break;
				case "quality":
					setQuality(value as QualityPreset);
					break;
				case "audioSources":
					setAudioSources(value as string[]);
					break;
				case "saveLocation":
					setSaveLocation(value as string);
					break;
				case "bufferSize":
					setBufferSize(value as number);
					break;
				case "openAfterReplay":
					setOpenAfterReplay(value as boolean);
					break;
				case "openAfterStop":
					setOpenAfterStop(value as boolean);
					break;
			}
			const newSettings = { ...currentSettings, [key]: value };
			saveSettings(newSettings);
		},
		[currentSettings],
	);

	const setAudioSource = useCallback(
		(source: string) => {
			updateSetting("audioSources", toggleAudioSource(audioSources, source));
		},
		[audioSources, updateSetting],
	);

	const audioTitle = (source: string): string => {
		if (source === "default_output") return "System Audio";
		if (source === "default_input") return "Microphone";
		if (source.startsWith("app:")) {
			const name = source.slice("app:".length);
			return appAudio.find((app) => app.id === name)?.name ?? name;
		}
		return audioDevices.find((device) => device.id === source)?.name ?? source;
	};

	const audioSummary = audioSources.length
		? audioSources.map(audioTitle).join(", ")
		: "None";

	const sourceIcon = (source: string) => {
		if (audioSources.includes(source)) return Icon.CheckCircle;
		if (source === "default_input") return Icon.Microphone;
		if (source === "default_output") return Icon.Speaker;
		if (source.startsWith("app:")) return Icon.AppWindow;
		const device = audioDevices.find((candidate) => candidate.id === source);
		return device && isOutputDevice(device) ? Icon.Speaker : Icon.Microphone;
	};

	const extraDevices = audioDevices.filter(
		(device) => device.id !== "default_output" && device.id !== "default_input",
	);

	const getCaptureSource = (): CaptureSource => {
		if (captureSourceType === "current-monitor") {
			return { type: "current-monitor" };
		} else if (captureSourceType === "monitor") {
			return { type: "monitor", id: monitorId };
		} else {
			return { type: "window" };
		}
	};

	const handleStart = async () => {
		try {
			if (status !== "idle") {
				await showToast({
					style: Toast.Style.Failure,
					title: "Recorder is active",
					message: "Stop the current recording first",
				});
				return;
			}

			const effectiveBufferSize = bufferSize || 60;
			const preferences = getPreferenceValues<Preferences>();
			const gsrPath = preferences["gsr-path"] || undefined;
			const options: RecorderOptions = {
				captureSource: getCaptureSource(),
				quality,
				resolution: resolution || undefined,
				audioSources,
				saveLocation,
				bufferSize: mode === "instant-replay" ? effectiveBufferSize : undefined,
				gsrPath,
			};

			let result: { success: boolean; error?: string };
			if (mode === "recording") {
				result = await startRecording(options);
			} else {
				result = await startInstantReplay(options);
			}

			if (result.success) {
				await closeMainWindow();
				await fetchStatus();
			} else {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to start",
					message: result.error,
				});
			}
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Error",
				message: String(error),
			});
		}
	};

	const handleStop = async () => {
		try {
			const outputInfo = await getOutputPathFromProcess();
			const currentStatus = status;
			const result = await stopRecording();
			if (result.success) {
				if (openAfterStop && outputInfo) {
					if (currentStatus === "recording") {
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
						title: "Stopped",
						message:
							currentStatus === "recording"
								? "Recording saved"
								: "Instant Replay stopped",
					});
				}
				await fetchStatus();
			} else {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to stop",
					message: result.error,
				});
			}
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Error",
				message: String(error),
			});
		}
	};

	const handleSaveReplay = async () => {
		try {
			const outputInfo = await getOutputPathFromProcess();
			const result = await saveInstantReplay();
			if (result.success) {
				if (openAfterReplay && outputInfo) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
					const latestFile = await getLatestFileInDirectory(
						outputInfo.directory,
					);
					if (latestFile) {
						await open(latestFile);
					}					await closeMainWindow();
				} else {
					await showToast({
						style: Toast.Style.Success,
						title: "Saved",
						message: "Last replay saved",
					});
				}
			} else {
				await showToast({
					style: Toast.Style.Failure,
					title: "Failed to save",
					message: result.error,
				});
			}
		} catch (error) {
			await showToast({
				style: Toast.Style.Failure,
				title: "Error",
				message: String(error),
			});
		}
	};

	const getPrimaryActionTitle = () => {
		if (status !== "idle") {
			return "Stop";
		}
		return mode === "recording" ? "Start Recording" : "Start Instant Replay";
	};

	const handlePrimaryAction = () => {
		if (status !== "idle") {
			handleStop();
		} else {
			handleStart();
		}
	};

	return (
		<Form
			isLoading={isLoading}
			actions={
				<ActionPanel>
					<Action
						title={getPrimaryActionTitle()} shortcut={{ modifiers: ["ctrl"], key: "a" }}
						onAction={handlePrimaryAction}
						icon={status !== "idle" ? Icon.Stop : Icon.CircleFilled}
					/>
					{status === "instant-replay" && (
						<Action
							title="Save Instant Replay"
							onAction={handleSaveReplay}
							icon={Icon.Download}
							shortcut={Keyboard.Shortcut.Common.Save}
						/>
					)}
				</ActionPanel>
			}
		>
			<StatusDisplay mode={status} />

			<Form.Separator />

			<Form.Dropdown
				id="mode"
				title="Mode"
				value={mode}
				onChange={(value) => updateSetting("mode", value as Mode)}
			>
				<Form.Dropdown.Item value="recording" title="Recording" />
				<Form.Dropdown.Item value="instant-replay" title="Instant Replay" />
			</Form.Dropdown>

			{mode === "instant-replay" && (
				<Form.TextField
					id="buffer-size"
					title="Buffer (sec)"
					placeholder="60"
					value={bufferSize === 0 ? "" : String(bufferSize)}
					onChange={(value) => {
						const num = parseInt(value);
						if (value === "" || isNaN(num)) {
							setBufferSize(0);
						} else {
							setBufferSize(num);
							updateSetting("bufferSize", num);
						}
					}}
				/>
			)}

			<Form.Dropdown
				id="capture-source"
				title="Capture"
				value={captureSourceType}
				onChange={(value) =>
					updateSetting(
						"captureSourceType",
						value as "current-monitor" | "monitor" | "window",
					)
				}
			>
				<Form.Dropdown.Item value="current-monitor" title="Current Monitor" />
				<Form.Dropdown.Item value="monitor" title="Select Monitor" />
				<Form.Dropdown.Item value="window" title="Window (Wayland)" />
			</Form.Dropdown>

			{captureSourceType === "monitor" && (
				<Form.Dropdown
					id="monitor-id"
					title="Monitor"
					value={monitorId}
					onChange={(value) => updateSetting("monitorId", value)}
				>
					{monitors.map((m) => (
						<Form.Dropdown.Item
							key={m.id}
							value={m.id}
							title={`${m.id} (${m.resolution})`}
						/>
					))}
				</Form.Dropdown>
			)}

			<Form.Dropdown
				id="quality"
				title="Quality"
				value={quality}
				onChange={(value) => updateSetting("quality", value as QualityPreset)}
			>
				<Form.Dropdown.Item value="medium" title="Medium" />
				<Form.Dropdown.Item value="high" title="High" />
				<Form.Dropdown.Item value="very_high" title="Very High" />
				<Form.Dropdown.Item value="ultra" title="Ultra" />
			</Form.Dropdown>

			<Form.Dropdown
				id="audio-sources"
				title="Audio Sources"
				value={AUDIO_SUMMARY}
				onChange={(value) => {
					if (value === AUDIO_SUMMARY) return;
					if (value === AUDIO_NONE) {
						updateSetting("audioSources", []);
						return;
					}
					setAudioSource(value);
				}}
			>
				<Form.Dropdown.Item
					value={AUDIO_SUMMARY}
					title={audioSummary}
					icon={Icon.Speaker}
				/>
				<Form.Dropdown.Section title="System">
					<Form.Dropdown.Item
						value={AUDIO_NONE}
						title="None"
						icon={Icon.XMarkCircle}
					/>
					<Form.Dropdown.Item
						value="default_output"
						title="System Audio"
						icon={sourceIcon("default_output")}
					/>
					<Form.Dropdown.Item
						value="default_input"
						title="Microphone"
						icon={sourceIcon("default_input")}
					/>
				</Form.Dropdown.Section>
				{extraDevices.length > 0 && (
					<Form.Dropdown.Section title="Devices">
						{extraDevices.map((device) => (
							<Form.Dropdown.Item
								key={device.id}
								value={device.id}
								title={device.name}
								icon={sourceIcon(device.id)}
							/>
						))}
					</Form.Dropdown.Section>
				)}
				{appAudio.length > 0 && (
					<Form.Dropdown.Section title="Applications">
						{appAudio.map((app) => (
							<Form.Dropdown.Item
								key={app.id}
								value={`app:${app.id}`}
								title={app.name}
								icon={sourceIcon(`app:${app.id}`)}
							/>
						))}
					</Form.Dropdown.Section>
				)}
			</Form.Dropdown>

			<Form.FilePicker
				id="save-location"
				title="Save to"
				value={saveLocation ? [saveLocation] : []}
				onChange={(value) => updateSetting("saveLocation", value[0] || "")}
				canChooseDirectories={true}
				canChooseFiles={false}
			/>

			<Form.Separator />

			<Form.Description
				title="Behavior"
				text="Configure what happens after saving or stopping"
			/>

			<Form.Checkbox
				id="open-after-replay"
				label="Open clip after saving replay"
				title="After Saving Replay"
				value={openAfterReplay}
				onChange={(value) => updateSetting("openAfterReplay", value)}
			/>

			<Form.Checkbox
				id="open-after-stop"
				label="Open directory after stopping"
				title="After Stopping"
				value={openAfterStop}
				onChange={(value) => updateSetting("openAfterStop", value)}
			/>
		</Form>
	);
}
