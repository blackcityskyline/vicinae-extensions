import { spawn } from "node:child_process";
import { useEffect, useRef, useState } from "react";
import {
	Action,
	ActionPanel,
	closeMainWindow,
	environment,
	Icon,
	List,
	PopToRootType,
	showToast,
	type LaunchProps,
} from "@vicinae/api";
import { waitForVicinaeLayerGone } from "./backends/hyprcapture";
import { isCommandAvailable } from "./backends/utils";
import { copyTextToClipboard } from "./lib/clipboard";
import {
	contrastRatio,
	formatCmyk,
	formatHsl,
	formatHsv,
	formatRgb,
	HARMONIES,
	HARMONY_ORDER,
	hexToRgb,
	paletteFor,
	parsePickedColor,
	relativeLuminance,
	rgbToCmyk,
	rgbToHsl,
	rgbToHsv,
	type Harmony,
} from "./lib/color";
import { writePaletteImage } from "./lib/palette-image";

type Phase =
	| { kind: "picking" }
	/** Cancelled, or nothing to show yet. */
	| { kind: "idle" }
	| { kind: "failed"; message: string }
	| { kind: "picked"; hex: string };

/**
 * Picks a colour and reopens the command on the result.
 *
 * The launcher has to be gone before the picker samples the screen, and a
 * command does not outlive the closed window for long. So hyprpicker runs from
 * a detached shell that outlives the command and launches this command again
 * with the colour in its arguments; the new instance opens on the result. An
 * empty colour means the pick was cancelled, and the launcher comes back on the
 * prompt instead of disappearing with the pick.
 */
const SCRIPT = [
	'hex=$(hyprpicker | grep -E "^#[0-9A-Fa-f]{6}$" | tail -n 1)',
	'if [ -n "$hex" ]; then',
	'  vicinae "$1?arguments=%7B%22pick%22%3A%22%23$(printf %s "$hex" | cut -c2-)%22%7D"',
	"else",
	'  vicinae "$1?arguments=%7B%22pick%22%3A%22%22%7D"',
	"fi",
].join("\n");

const launchUrl = `vicinae://launch/@${environment.ownerOrAuthorName}/${environment.extensionName}/${environment.commandName}`;

// Ctrl+digit is the launcher's own quick-select, so the harmony keys need alt.
const HARMONY_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

export default function ColorPicker({ arguments: args }: LaunchProps) {
	// The launcher sends no arguments; only the picker's own relaunch does.
	const delivered = typeof args?.pick === "string" ? args.pick : null;
	const launchedHex = delivered ? parsePickedColor(delivered) : null;
	const cancelled = delivered === "";

	const [phase, setPhase] = useState<Phase>(
		launchedHex
			? { kind: "picked", hex: launchedHex }
			: cancelled
				? { kind: "idle" }
				: { kind: "picking" },
	);
	const started = useRef(false);
	const pickedHex = phase.kind === "picked" ? phase.hex : null;
	const [harmony, setHarmony] = useState<Harmony>("shades");
	const [paletteUrl, setPaletteUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!pickedHex) return;
		const colours = paletteFor(pickedHex, harmony).map((swatch) => swatch.hex);
		const path = writePaletteImage(environment.supportPath, pickedHex, harmony, colours);
		setPaletteUrl(`file://${path}?raycast-width=450&raycast-height=180`);
	}, [pickedHex, harmony]);

	const pick = async (): Promise<void> => {
		if (!isCommandAvailable("hyprpicker")) {
			setPhase({
				kind: "failed",
				message:
					"hyprpicker is not installed. Install it with: sudo pacman -S hyprpicker",
			});
			return;
		}

		setPhase({ kind: "picking" });
		try {
			await closeMainWindow({ popToRootType: PopToRootType.Suspended });
			// A picker started while the launcher is still on screen samples it.
			if (!(await waitForVicinaeLayerGone())) {
				setPhase({
					kind: "failed",
					message: "Vicinae is still visible; try again",
				});
				return;
			}
			spawn("/bin/sh", ["-c", SCRIPT, "sh", launchUrl], {
				detached: true,
				stdio: "ignore",
			}).unref();
		} catch (e) {
			setPhase({ kind: "failed", message: (e as Error).message });
		}
	};

	useEffect(() => {
		// A normal launch starts the picker; the relaunch carries the result and
		// must not open a second picker.
		if (started.current) return;
		started.current = true;
		if (delivered === null) void pick();
	}, []);

	const copy = async (value: string): Promise<void> => {
		if (await copyTextToClipboard(value)) {
			showToast({ title: "Copied to clipboard" });
		}
	};

	const copyAndClose = async (value: string): Promise<void> => {
		if (await copyTextToClipboard(value)) await closeMainWindow();
	};

	const actions = (value: string, format: string) => (
		<ActionPanel>
			<Action
				title={`Copy ${format}`}
				icon={Icon.CopyClipboard}
				shortcut="copy"
				onAction={() => copy(value)}
			/>
			<Action
				title={`Copy ${format} and Close`}
				icon={Icon.CopyClipboard}
				shortcut={{ modifiers: ["ctrl"], key: "enter" }}
				onAction={() => copyAndClose(value)}
			/>
			<Action
				title="Pick Another Colour"
				icon={Icon.Swatch}
				shortcut="refresh"
				onAction={() => void pick()}
			/>
			<ActionPanel.Section title={`Palette · ${HARMONIES[harmony].title}`}>
				{HARMONY_ORDER.map((id, index) => (
					<Action
						key={id}
						title={id === harmony ? `${HARMONIES[id].title} ✓` : HARMONIES[id].title}
						icon={Icon.Swatch}
						shortcut={{
							modifiers: ["ctrl", "alt"],
							key: HARMONY_KEYS[index] ?? "1",
						}}
						onAction={() => setHarmony(id)}
					/>
				))}
				<Action
					title="Next Palette"
					icon={Icon.ArrowClockwise}
					shortcut={{ modifiers: ["ctrl"], key: "p" }}
					onAction={() =>
						setHarmony(
							HARMONY_ORDER[
								(HARMONY_ORDER.indexOf(harmony) + 1) % HARMONY_ORDER.length
							] ?? "shades",
						)
					}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);

	if (phase.kind === "picked") {
		const palette = paletteFor(phase.hex, harmony);
		const rgb = hexToRgb(phase.hex);
		const hsl = rgb ? rgbToHsl(rgb) : null;
		const hsv = rgb ? rgbToHsv(rgb) : null;
		const cmyk = rgb ? rgbToCmyk(rgb) : null;
		const rows: [string, string][] = [
			["HEX", phase.hex],
			["RGB", rgb ? formatRgb(rgb) : ""],
			["HSL", hsl ? formatHsl(hsl) : ""],
			["HSV", hsv ? formatHsv(hsv) : ""],
			["CMYK", cmyk ? formatCmyk(cmyk) : ""],
		];
		// tintColor draws a swatch in the colour itself, no image files needed.
		const swatch = (hex: string) => ({ source: Icon.CircleFilled, tintColor: hex });
		const onWhite = rgb ? contrastRatio(rgb, { r: 255, g: 255, b: 255 }) : 0;
		const onBlack = rgb ? contrastRatio(rgb, { r: 0, g: 0, b: 0 }) : 0;
		const grade = (ratio: number) =>
			ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "fails";
		const verdict = (ratio: number) => ({
			color: ratio >= 4.5 ? "#22C55E" : ratio >= 3 ? "#EAB308" : "#EF4444",
			value: `${ratio.toFixed(1)}:1 · ${grade(ratio)}`,
		});

		const detail = (
			<List.Item.Detail
				markdown={paletteUrl ? `![](${paletteUrl})` : ""}
				metadata={
					<List.Item.Detail.Metadata>
						<List.Item.Detail.Metadata.Label title="Hue" text={`${hsl?.h ?? 0}°`} />
						<List.Item.Detail.Metadata.Label title="Saturation" text={`${hsl?.s ?? 0}%`} />
						<List.Item.Detail.Metadata.Label title="Lightness" text={`${hsl?.l ?? 0}%`} />
						<List.Item.Detail.Metadata.Label
							title="Luminance"
							text={(rgb ? relativeLuminance(rgb) : 0).toFixed(3)}
						/>
						<List.Item.Detail.Metadata.Separator />
						<List.Item.Detail.Metadata.Label
							title="Harmony"
							text={HARMONIES[harmony].title}
						/>
						<List.Item.Detail.Metadata.Label title="On white" text={verdict(onWhite)} />
						<List.Item.Detail.Metadata.Label title="On black" text={verdict(onBlack)} />
					</List.Item.Detail.Metadata>
				}
			/>
		);

		return (
			<List
				navigationTitle={`Picked ${phase.hex}`}
				searchBarPlaceholder="Pick another colour with ctrl+r"
				filtering={false}
				isShowingDetail
			>
				<List.Section title="Formats">
					{rows.map(([label, value]) => (
						<List.Item
							key={label}
							title={value}
							subtitle={label}
							icon={swatch(phase.hex)}
							detail={detail}
							actions={actions(value, label)}
						/>
					))}
				</List.Section>
				<List.Section title={`Palette · ${HARMONIES[harmony].title}`}>
					{palette.map((cell) => (
						<List.Item
							key={`${cell.hex}-${cell.label}`}
							title={cell.hex}
							subtitle={cell.label}
							icon={swatch(cell.hex)}
							detail={detail}
							actions={actions(cell.hex, "Swatch")}
						/>
					))}
				</List.Section>
			</List>
		);
	}

	const failed = phase.kind === "failed";
	return (
		<List navigationTitle="Color Picker">
			<List.Item
				title={failed ? "Could not pick a colour" : "Pick a Colour"}
				subtitle={
					failed
						? phase.message
						: phase.kind === "picking"
							? "Waiting for the picker…"
							: "The picker was closed"
				}
				icon={failed ? Icon.Warning : Icon.Swatch}
				actions={
					<ActionPanel>
						<Action
							title="Pick a Colour"
							icon={Icon.Swatch}
							shortcut="open"
							onAction={() => void pick()}
						/>
					</ActionPanel>
				}
			/>
		</List>
	);
}
