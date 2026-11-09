import { Action, ActionPanel, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { applyPreset, clearPreset, getState, loadPresets, presetsDir, reload } from "~/api/presets.ts";
import { OFF_SLUG, offPreset, type Preset } from "~/utils/preset.ts";

type Kind = "border" | "shader";

const LABEL: Record<Kind, string> = { border: "Border", shader: "Shader" };

export default function PresetList({ kind }: { kind: Kind }) {
	const [presets, setPresets] = useState<Preset[]>([]);
	const [current, setCurrent] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		void (async () => {
			try {
				const [loaded, state] = await Promise.all([loadPresets(kind), getState()]);
				setPresets(loaded);
				setCurrent(kind === "border" ? state.border : state.shader);
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: `Could not read ${kind} presets`,
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				setIsLoading(false);
			}
		})();
	}, [kind]);

	async function apply(preset: Preset) {
		if (preset.slug === OFF_SLUG) {
			await clear();
			return;
		}
		const result = await applyPreset(kind, preset);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not apply ${preset.name}`, message: result.error });
			return;
		}
		setCurrent(preset.slug);
		await showToast({ style: Toast.Style.Success, title: `Applied ${preset.name}` });
	}

	async function clear() {
		const result = await clearPreset(kind);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not remove ${LABEL[kind].toLowerCase()}`, message: result.error });
			return;
		}
		setCurrent(null);
		await showToast({ style: Toast.Style.Success, title: `${LABEL[kind]} removed` });
	}

	async function reloadConfig() {
		const result = await reload();
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Hyprland reload failed", message: result.error });
			return;
		}
		await showToast({ style: Toast.Style.Success, title: "Hyprland reloaded" });
	}

	function actions(preset?: Preset) {
		return (
			<ActionPanel>
				{preset ? (
					<Action
						title={`Apply ${preset.name}`}
						icon={Icon.Check}
						shortcut={{ modifiers: ["ctrl"], key: "return" }}
						onAction={() => {
							void apply(preset);
						}}
					/>
				) : null}
				{current && preset?.slug !== OFF_SLUG ? (
					<Action
						title={`Remove ${LABEL[kind]}`}
						icon={Icon.Trash}
						shortcut={Keyboard.Shortcut.Common.Remove}
						onAction={() => {
							void clear();
						}}
					/>
				) : null}
				<ActionPanel.Section>
					<Action
						title="Reload Hyprland"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => {
							void reloadConfig();
						}}
					/>
					<Action.Open
						title={`Open ${kind} presets folder`}
						icon={Icon.Folder}
						shortcut={Keyboard.Shortcut.Common.Open}
						target={presetsDir(kind)}
					/>
				</ActionPanel.Section>
			</ActionPanel>
		);
	}

	function item(preset: Preset) {
		return (
			<List.Item
				key={`${preset.origin}:${preset.slug}`}
				title={preset.name}
				subtitle={preset.description}
				keywords={[preset.slug, preset.tag]}
				icon={preset.slug === OFF_SLUG ? Icon.Power : kind === "border" ? Icon.Swatch : Icon.Eye}
				active={preset.slug === OFF_SLUG ? current === null : current === preset.slug}
				accessories={[{ tag: preset.tag }]}
				actions={actions(preset)}
			/>
		);
	}

	const shipped = presets.filter((preset) => preset.origin === "shipped");
	const personal = presets.filter((preset) => preset.origin === "personal");

	return (
		<List
			isLoading={isLoading}
			navigationTitle={`Hyprland ${LABEL[kind]}s`}
			searchBarPlaceholder={`Search ${kind} presets`}
		>
			<List.Section title="Off">{item(offPreset(kind))}</List.Section>
			<List.Section title={`${LABEL[kind]}s`}>{shipped.map(item)}</List.Section>
			{personal.length > 0 ? <List.Section title="Your Presets">{personal.map(item)}</List.Section> : null}
			<List.EmptyView title={`No ${kind} presets found`} actions={actions()} />
		</List>
	);
}
