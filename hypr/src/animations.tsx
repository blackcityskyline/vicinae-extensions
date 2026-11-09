import { Action, ActionPanel, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useEffect, useState } from "react";

import {
	ANIM_DIR,
	HYPRLAND_FILE,
	applyPreset,
	disableAnimations,
	getState,
	loadPresets,
	loaderInstalled,
	reload,
} from "~/api/presets.ts";
import { OFF_SLUG, offPreset, type AnimState, type Preset } from "~/utils/preset.ts";

export default function Animations() {
	const [presets, setPresets] = useState<Preset[]>([]);
	const [state, setState] = useState<AnimState>({ enabled: false, last: null, border: null, shader: null });
	const [hasLoader, setHasLoader] = useState(true);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		void (async () => {
			try {
				const [loaded, current, loader] = await Promise.all([
					loadPresets("animation"),
					getState(),
					loaderInstalled(),
				]);
				setPresets(loaded);
				setState(current);
				setHasLoader(loader);
			} catch (error) {
				await showToast({
					style: Toast.Style.Failure,
					title: "Could not read presets",
					message: error instanceof Error ? error.message : String(error),
				});
			} finally {
				setIsLoading(false);
			}
		})();
	}, []);

	async function apply(preset: Preset) {
		if (preset.slug === OFF_SLUG) {
			await disable();
			return;
		}
		const result = await applyPreset("animation", preset);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not apply ${preset.name}`, message: result.error });
			return;
		}
		setState((current) => ({ ...current, enabled: true, last: preset.slug }));
		await showToast({ style: Toast.Style.Success, title: `Applied ${preset.name}` });
	}

	async function disable() {
		const result = await disableAnimations();
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Could not disable animations", message: result.error });
			return;
		}
		setState((current) => ({ ...current, enabled: false }));
		await showToast({ style: Toast.Style.Success, title: "Animations disabled" });
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
						title="Apply Preset"
						icon={Icon.Check}
						shortcut={{ modifiers: ["ctrl"], key: "return" }}
						onAction={() => {
							void apply(preset);
						}}
					/>
				) : null}
				<ActionPanel.Section>
					<Action
						title="Disable Animations"
						icon={Icon.Power}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
						onAction={() => {
							void disable();
						}}
					/>
					<Action
						title="Reload Hyprland"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => {
							void reloadConfig();
						}}
					/>
					<Action.Open
						title="Open Presets Folder"
						icon={Icon.Folder}
						shortcut={Keyboard.Shortcut.Common.Open}
						target={ANIM_DIR}
					/>
					<Action.Open
						title="Open Hyprland Config"
						icon={Icon.Folder}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
						target={HYPRLAND_FILE}
					/>
				</ActionPanel.Section>
			</ActionPanel>
		);
	}

	const shipped = presets.filter((preset) => preset.origin === "shipped");
	const personal = presets.filter((preset) => preset.origin === "personal");

	function item(preset: Preset) {
		return (
			<List.Item
				key={`${preset.origin}:${preset.slug}`}
				title={preset.name}
				subtitle={preset.description}
				keywords={[preset.slug, preset.tag]}
				icon={preset.slug === OFF_SLUG ? Icon.Power : Icon.Bolt}
				active={preset.slug === OFF_SLUG ? !state.enabled : state.enabled && state.last === preset.slug}
				accessories={[{ tag: preset.tag }]}
				actions={actions(preset)}
			/>
		);
	}

	return (
		<List
			isLoading={isLoading}
			navigationTitle="Hyprland Animations"
			searchBarPlaceholder="Search animation presets"
		>
			{!hasLoader ? (
				<List.Section title="Setup">
					<List.Item
						title="Hyprland does not load presets yet"
						subtitle={`Add a dofile of ${ANIM_DIR}/active.lua to hyprland.lua`}
						icon={Icon.Warning}
						actions={
							<ActionPanel>
								<Action.Open
									title="Open hyprland.lua"
									shortcut={Keyboard.Shortcut.Common.Open}
									target={HYPRLAND_FILE}
								/>
							</ActionPanel>
						}
					/>
				</List.Section>
			) : null}
			<List.Section title="Off">{item(offPreset("animation"))}</List.Section>
			<List.Section title="Presets">{shipped.map(item)}</List.Section>
			{personal.length > 0 ? <List.Section title="Your Presets">{personal.map(item)}</List.Section> : null}
			<List.EmptyView title="No animation presets found" actions={actions()} />
		</List>
	);
}
