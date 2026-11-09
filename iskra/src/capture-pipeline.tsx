import { useEffect, useMemo, useState } from "react";
import {
	Action,
	ActionPanel,
	Detail,
	Form,
	Icon,
	Keyboard,
	LocalStorage,
	showHUD,
} from "@vicinae/api";
import { findBackend, getUsableBackends } from "./backends";
import type { CaptureMode } from "./backends/types";
import { ScanResult } from "./components/ScanResult";
import { annotateFile } from "./lib/annotate";
import { captureScreenshot } from "./lib/capture";
import { copyToClipboard } from "./lib/clipboard";
import { getSavePath, saveImageFile } from "./lib/filesystem";
import { getOcrLanguage } from "./lib/ocr-language";
import { getPrefs } from "./lib/preferences";
import { ScanError, runOcr, runQrScan } from "./lib/scan";
import { resolveBackend } from "./lib/tool-selection";

/**
 * One capture, several steps. The settings are a form default, not a manifest
 * preference: they are meant to be changed per run and remembered on request.
 */

const DEFAULTS_KEY = "capture_pipeline";

type Settings = {
	source: string;
	mode: CaptureMode;
	/** Seconds, kept as text because that is what a TextField holds. */
	delay: string;
	copy: boolean;
	save: boolean;
	annotate: boolean;
	ocr: boolean;
	qr: boolean;
};

const DEFAULTS: Settings = {
	source: "auto",
	mode: "area",
	delay: "0",
	copy: false,
	save: true,
	annotate: false,
	ocr: false,
	qr: false,
};

const MODE_TITLES: Record<CaptureMode, string> = {
	area: "Area",
	window: "Window",
	monitor: "Monitor",
	full: "All monitors",
};

const ALL_MODES = Object.keys(MODE_TITLES) as CaptureMode[];

const loadDefaults = async (): Promise<Settings> => {
	const stored = await LocalStorage.getItem<string>(DEFAULTS_KEY);
	if (!stored) return DEFAULTS;
	try {
		return { ...DEFAULTS, ...(JSON.parse(stored) as Partial<Settings>) };
	} catch {
		return DEFAULTS;
	}
};

type State =
	| { kind: "form" }
	| { kind: "running" }
	| { kind: "text"; text: string }
	| { kind: "done"; lines: string[] }
	| { kind: "error"; message: string; installCommand: string | null };

export default function CapturePipeline() {
	const [state, setState] = useState<State>({ kind: "form" });
	const [settings, setSettings] = useState<Settings | null>(null);
	const usable = useMemo(() => getUsableBackends(), []);

	useEffect(() => {
		loadDefaults().then(setSettings);
	}, []);

	const run = async (current: Settings) => {
		setState({ kind: "running" });
		try {
			const prefs = getPrefs();
			const backend =
				current.source === "auto"
					? await resolveBackend(prefs, current.mode)
					: findBackend(current.source);

			if (!backend || !backend.supportedModes.includes(current.mode)) {
				setState({
					kind: "error",
					message: `The chosen capture tool cannot capture "${current.mode}" here.`,
					installCommand: null,
				});
				return;
			}

			const seconds = Number(current.delay);
			const delayMs = Number.isFinite(seconds) && seconds > 0
				? Math.round(seconds * 1000)
				: 0;
			const captured = await captureScreenshot(backend, current.mode, {
				native: false,
				delayMs,
			});
			if (!captured) {
				setState({
					kind: "error",
					message: "Nothing was captured. The selection was cancelled, or the capture tool reported an error.",
					installCommand: null,
				});
				return;
			}

			const lines: string[] = [];
			const found: string[] = [];
			const path = captured.path;
			const handoff = captured.kind === "handoff";

			if (handoff) {
				lines.push(
					`${backend.displayName} saved and copied the capture itself; Copy, Save and Annotate do not apply.`,
				);
			}

			if ((current.ocr || current.qr) && !path) {
				lines.push(
					"The capture tool did not report where it saved the file, so OCR and QR could not run.",
				);
			} else if (path) {
				// The scans read the plain capture: annotation may add ink, and Save
				// consumes the temporary file, so both come after.
				if (current.ocr) {
					const text = await runOcr(path, await getOcrLanguage());
					if (text) found.push(`OCR:\n${text}`);
					else lines.push("No text detected.");
				}
				if (current.qr) {
					const text = await runQrScan(path);
					if (text) found.push(`QR:\n${text}`);
					else lines.push("No QR code detected.");
				}
			}

			if (!handoff && path) {
				if (current.annotate) {
					await annotateFile(path);
					lines.push("Opened the annotation tool.");
				}
				if (current.copy) {
					await copyToClipboard(path, false);
					lines.push("Copied to the clipboard.");
				}
				if (current.save) {
					lines.push(`Saved \`${saveImageFile(path, getSavePath(prefs))}\`.`);
				}
			}

			setState(found.length > 0 ? { kind: "text", text: found.join("\n\n") } : { kind: "done", lines });
		} catch (e) {
			console.error("Pipeline failed", e);
			setState({
				kind: "error",
				message: (e as Error).message,
				installCommand: e instanceof ScanError ? e.installCommand : null,
			});
		}
	};

	const saveDefaults = async (current: Settings) => {
		await LocalStorage.setItem(DEFAULTS_KEY, JSON.stringify(current));
		showHUD("Pipeline defaults saved");
	};

	if (state.kind === "text") {
		return <ScanResult text={state.text} title="Pipeline Result" />;
	}

	if (state.kind === "running") {
		return <Detail isLoading markdown="## Capturing..." />;
	}

	if (state.kind === "error") {
		const { installCommand } = state;
		return (
			<Detail
				markdown={`## Pipeline failed\n\n${state.message}${installCommand ? `\n\n\`${installCommand}\`` : ""}`}
			/>
		);
	}

	if (state.kind === "done") {
		return (
			<Detail
				markdown={`## Pipeline finished\n\n${state.lines.map((line) => `- ${line}`).join("\n")}`}
				actions={
					<ActionPanel>
						<Action
							title="Run Again" shortcut={{ modifiers: ["ctrl"], key: "a" }}
							icon={Icon.Play}
							onAction={() => settings && run(settings)}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	if (!settings) return <Detail isLoading markdown="## Loading..." />;

	const chosen = settings.source === "auto" ? null : findBackend(settings.source);
	const modes = chosen?.supportedModes ?? ALL_MODES;
	const update = (patch: Partial<Settings>) =>
		setSettings({ ...settings, ...patch });

	return (
		<Form
			navigationTitle="Capture Pipeline"
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Run Pipeline" shortcut={{ modifiers: ["ctrl"], key: "i" }}
						icon={Icon.Play}
						onSubmit={() => run(settings)}
					/>
					<Action
						title="Save as Default"
						icon={Icon.SaveDocument}
						shortcut={Keyboard.Shortcut.Common.Save}
						onAction={() => saveDefaults(settings)}
					/>
				</ActionPanel>
			}
		>
			<Form.Dropdown
				id="source"
				title="Capture Tool"
				value={settings.source}
				onChange={(source) => {
					const backend = source === "auto" ? null : findBackend(source);
					const supported = backend?.supportedModes ?? ALL_MODES;
					update({
						source,
						mode: supported.includes(settings.mode) ? settings.mode : supported[0]!,
					});
				}}
			>
				<Form.Dropdown.Item title="Auto-detect" value="auto" />
				{usable.map((backend) => (
					<Form.Dropdown.Item
						key={backend.id}
						title={backend.displayName}
						value={backend.id}
					/>
				))}
			</Form.Dropdown>

			<Form.Dropdown
				id="mode"
				title="Mode"
				value={settings.mode}
				onChange={(mode) => update({ mode: mode as CaptureMode })}
			>
				{modes.map((mode) => (
					<Form.Dropdown.Item
						key={mode}
						title={MODE_TITLES[mode]}
						value={mode}
					/>
				))}
			</Form.Dropdown>

			<Form.TextField
				id="delay"
				title="Delay (seconds)"
				placeholder="0"
				value={settings.delay}
				onChange={(delay) => update({ delay })}
			/>

			<Form.Checkbox
				id="copy"
				title="Copy"
				label="Copy to the clipboard"
				value={settings.copy}
				onChange={(copy) => update({ copy })}
			/>
			<Form.Checkbox
				id="save"
				title="Save"
				label="Save to the screenshot directory"
				value={settings.save}
				onChange={(save) => update({ save })}
			/>
			<Form.Checkbox
				id="annotate"
				title="Annotate"
				label="Open the annotation tool"
				value={settings.annotate}
				onChange={(annotate) => update({ annotate })}
			/>
			<Form.Checkbox
				id="ocr"
				title="OCR"
				label="Read text from the capture"
				value={settings.ocr}
				onChange={(ocr) => update({ ocr })}
			/>
			<Form.Checkbox
				id="qr"
				title="QR"
				label="Decode a QR code or barcode"
				value={settings.qr}
				onChange={(qr) => update({ qr })}
			/>

			<Form.Description text="OCR and QR read the plain capture. Save runs last, so the saved file carries any annotations. A tool that owns its own overlay saves and copies by itself; Copy, Save and Annotate are ignored there." />
		</Form>
	);
}
