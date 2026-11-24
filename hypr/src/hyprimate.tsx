/**
 * hyprimate lives in the plugin's config values, and Hyprland 0.57 applies
 * those at runtime through `hyprctl eval 'hl.config{...}'` — `hyprctl keyword`
 * answers "unknown request" there. So this list sets one value per press, and
 * Save to Config writes the same settings into a marked block in
 * `~/.config/hypr/plugins/hyprimate.lua` so they survive a reload.
 */

import { Action, ActionPanel, Clipboard, Icon, Keyboard, List, Toast, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import {
	HYPRIMATE_FILE,
	applyAssignments,
	applySetting,
	currentStyle,
	pluginLoaded,
	readOptions,
	saveToConfig,
	reload,
	sessionAssignments,
} from "~/api/hyprimate.ts";
import { HyprimateOptions } from "~/components/hyprimate-options.tsx";
import {
	WINDOW_STYLES,
	WORKSPACE_STYLES,
	globalOption,
	globalOptions,
	managedBlock,
	optionKey,
	optionsFor,
	tunableGlobals,
	workspaceOptionsFor,
	type OptionState,
	type StyleInfo,
} from "~/utils/hyprimate.ts";

const STYLE_ICONS: Record<string, Icon> = {
	liquid: Icon.Droplets,
	paper: Icon.Text,
	cloth: Icon.Wind,
	swarm: Icon.Ghost,
	bubble: Icon.Circle,
	smoke: Icon.Cloud,
	burn: Icon.Sun,
	construction: Icon.Hammer,
	rotation: Icon.RotateClockwise,
	planet_hop: Icon.Star,
	cube: Icon.Box,
	lava: Icon.Sun,
};

/** Switches worth a place on the front screen, in the order they matter. */
const SWITCHES = [
	{ path: "window.enabled", title: "Window Effects", hint: "Movement, opening and closing all at once." },
	{ path: "window.open.enabled", title: "Opening", hint: "Animate windows as they appear." },
	{ path: "window.close.enabled", title: "Closing", hint: "Animate windows as they leave." },
	{ path: "window.movement.enabled", title: "Movement", hint: "Deform windows while they move." },
	{ path: "window.movement.workspace_movement", title: "Workspace Slides", hint: "Let workspace slides trigger movement effects." },
	{ path: "workspace.enabled", title: "Workspace Transitions", hint: "Animate switching between workspaces." },
] as const;

const INSTALL_HINT = "hyprpm add https://github.com/JustinBacher/hyprimate && hyprpm enable hyprimate && hyprpm reload";

/** Not a real style: the tuner lists switches and external effects that have no style. */
const GLOBAL_STYLE: StyleInfo = {
	slug: "global",
	name: "Global Settings",
	tagline: "Switches, external shader effects and durations.",
};

export default function Hyprimate() {
	const { push } = useNavigation();
	const [loading, setLoading] = useState(true);
	const [available, setAvailable] = useState(true);
	const [windowStyle, setWindowStyle] = useState("liquid");
	const [workspaceStyle, setWorkspaceStyle] = useState("rotation");
	const [states, setStates] = useState<Map<string, OptionState | null>>(new Map());

	async function load() {
		setLoading(true);
		try {
			if (!(await pluginLoaded())) {
				setAvailable(false);
				return;
			}
			setAvailable(true);
			const [style, workspace, globals] = await Promise.all([
				currentStyle("window.style"),
				currentStyle("workspace.style"),
				readOptions(globalOptions()),
			]);
			if (style) setWindowStyle(style);
			if (workspace) setWorkspaceStyle(workspace);
			setStates(globals);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void load();
	}, []);

	function remember(option: { path: string }, value: string | number | boolean) {
		setStates((previous) => new Map(previous).set(option.path, { value, set: true }));
	}

	async function applyOption(
		option: ReturnType<typeof globalOption>,
		value: string | number | boolean,
		title: string,
	): Promise<boolean> {
		const result = await applySetting(option, value);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not set ${option.label}`, message: result.error });
			return false;
		}
		remember(option, value);
		await showToast({ style: Toast.Style.Success, title });
		return true;
	}

	function setStyle(style: StyleInfo, workspace: boolean) {
		const option = globalOption(workspace ? "workspace.style" : "window.style");
		void applyOption(option, style.slug, `${workspace ? "Workspace" : "Window"} style: ${style.name}`).then((ok) => {
			if (!ok) return;
			if (workspace) setWorkspaceStyle(style.slug);
			else setWindowStyle(style.slug);
		});
	}

	function toggle(path: (typeof SWITCHES)[number]["path"]) {
		const option = globalOption(path);
		const current = states.get(path)?.value;
		void applyOption(option, current !== true, `${option.label} ${current === true ? "off" : "on"}`);
	}

	async function disableAllEffects() {
		const options = [globalOption("window.enabled"), globalOption("workspace.enabled")];
		const result = await applyAssignments(options.map((option) => ({ option, value: false })));
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Could not disable effects", message: result.error });
			return;
		}
		setStates((previous) => {
			const next = new Map(previous);
			for (const option of options) next.set(option.path, { value: false, set: true });
			return next;
		});
		await showToast({ style: Toast.Style.Success, title: "Window and workspace effects off" });
	}

	async function saveConfig() {
		const assignments = await sessionAssignments();
		if (assignments.length === 0) {
			await showToast({ style: Toast.Style.Failure, title: "Nothing to save", message: "No hyprimate setting is set yet." });
			return;
		}
		const result = await saveToConfig(assignments);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Could not save", message: result.error });
			return;
		}
		await showToast({
			style: Toast.Style.Success,
			title: `Saved ${assignments.length} settings`,
			message: `${HYPRIMATE_FILE} reloaded`,
		});
	}

	async function copyLua() {
		const assignments = await sessionAssignments();
		await Clipboard.copy(managedBlock(assignments));
		await showToast({ style: Toast.Style.Success, title: `Copied ${assignments.length} settings as Lua` });
	}

	async function reloadConfig() {
		const result = await reload();
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Hyprland reload failed", message: result.error });
			return;
		}
		await load();
		await showToast({ style: Toast.Style.Success, title: "Hyprland reloaded" });
	}

	function styleActions(style: StyleInfo, workspace: boolean) {
		const active = workspace ? workspaceStyle === style.slug : windowStyle === style.slug;
		return (
			<ActionPanel>
				<Action
					title={active ? `${style.name} is active` : `Use ${style.name}`}
					icon={Icon.Check}
					shortcut={{ modifiers: ["ctrl"], key: "return" }}
					onAction={() => setStyle(style, workspace)}
				/>
				<ActionPanel.Section>
					<Action
						title={`Tune ${style.name}…`}
						icon={Icon.Cog}
						shortcut={{ modifiers: ["ctrl"], key: "t" }}
						onAction={() => push(<HyprimateOptions style={style} workspace={workspace} />)}
					/>
					<Action.CopyToClipboard title="Copy Style Name" content={style.slug} />
				</ActionPanel.Section>
				<ActionPanel.Section>{configActions()}</ActionPanel.Section>
			</ActionPanel>
		);
	}

	function styleItem(style: StyleInfo, workspace: boolean) {
		const active = workspace ? workspaceStyle === style.slug : windowStyle === style.slug;
		const count = workspace ? workspaceOptionsFor(style.slug).length : optionsFor(style.slug, "shared").length;
		return (
			<List.Item
				key={style.slug}
				title={style.name}
				subtitle={style.tagline}
				keywords={[style.slug, workspace ? "workspace" : "window"]}
				icon={STYLE_ICONS[style.slug] ?? Icon.Circle}
				accessories={[{ tag: `${count} settings` }, ...(active ? [{ tag: "active" }] : [])]}
				actions={styleActions(style, workspace)}
			/>
		);
	}

	function configActions() {
		return (
			<>
				<Action
					title="Save to Config"
					icon={Icon.Download}
					shortcut={{ modifiers: ["ctrl"], key: "s" }}
					onAction={() => void saveConfig()}
				/>
				<Action
					title="Copy Settings as Lua"
					icon={Icon.CopyClipboard}
					shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
					onAction={() => void copyLua()}
				/>
				<Action
					title="Disable All Effects"
				icon={Icon.Power}
				shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
				onAction={() => void disableAllEffects()}
			/>
			<Action
					title="Reload Hyprland"
					icon={Icon.ArrowClockwise}
					shortcut={Keyboard.Shortcut.Common.Refresh}
					onAction={() => void reloadConfig()}
				/>
				<Action.Open title="Open Plugin Config File" icon={Icon.Folder} target={HYPRIMATE_FILE} shortcut={{ modifiers: ["ctrl"], key: "o" }} />
				<Action.OpenInBrowser
					title="Open hyprimate README"
					icon={Icon.Book}
					url="https://github.com/JustinBacher/hyprimate"
					shortcut={{ modifiers: ["ctrl", "shift"], key: "o" }}
				/>
			</>
		);
	}

	const tuningActions = (
		<ActionPanel>
			<Action
				title={`Tune ${windowStyle}…`}
				icon={Icon.Cog}
				shortcut={{ modifiers: ["ctrl"], key: "return" }}
				onAction={() => {
					const style = WINDOW_STYLES.find((candidate) => candidate.slug === windowStyle);
					if (style) push(<HyprimateOptions style={style} />);
				}}
			/>
			<ActionPanel.Section>{configActions()}</ActionPanel.Section>
		</ActionPanel>
	);

	const windowStyleInfo = WINDOW_STYLES.find((style) => style.slug === windowStyle) ?? (WINDOW_STYLES[0] as StyleInfo);
	const workspaceStyleInfo = WORKSPACE_STYLES.find((style) => style.slug === workspaceStyle) ?? (WORKSPACE_STYLES[0] as StyleInfo);

	if (!available && !loading) {
		return (
			<List navigationTitle="Hyprimate" searchBarPlaceholder="hyprimate is not loaded">
				<List.Section title="Setup">
					<List.Item
						title="hyprimate is not loaded"
						subtitle={INSTALL_HINT}
						icon={Icon.Warning}
						actions={
							<ActionPanel>
								<Action.CopyToClipboard title="Copy Install Commands" content={INSTALL_HINT} />
								<Action title="Check Again" icon={Icon.ArrowClockwise} onAction={() => void load()} />
								<Action.OpenInBrowser title="Open hyprimate README" icon={Icon.Book} url="https://github.com/JustinBacher/hyprimate" />
							</ActionPanel>
						}
					/>
				</List.Section>
			</List>
		);
	}

	return (
		<List isLoading={loading} navigationTitle="Hyprimate" searchBarPlaceholder="Search styles, switches and settings">
			<List.Section title="Window Style">
				{WINDOW_STYLES.map((style) => styleItem(style, false))}
			</List.Section>
			<List.Section title="Workspace Style">
				{WORKSPACE_STYLES.map((style) => styleItem(style, true))}
			</List.Section>
			<List.Section title="Tune">
				<List.Item
					title={`${windowStyleInfo.name} Settings`}
					subtitle="Movement, opening, closing and shared values for the window style"
					icon={Icon.Cog}
					accessories={[{ tag: "window" }]}
					actions={tuningActions}
				/>
				<List.Item
					title={`${workspaceStyleInfo.name} Settings`}
					subtitle="Settings for the workspace transition"
					icon={Icon.Cog}
					accessories={[{ tag: "workspace" }]}
					actions={
						<ActionPanel>
							<Action
								title={`Tune ${workspaceStyleInfo.name}…`}
								icon={Icon.Cog}
								shortcut={{ modifiers: ["ctrl"], key: "return" }}
								onAction={() => push(<HyprimateOptions style={workspaceStyleInfo} workspace />)}
							/>
							<ActionPanel.Section>{configActions()}</ActionPanel.Section>
						</ActionPanel>
					}
				/>
				<List.Item
					title="Global Settings"
					subtitle="Every switch, external shader effect and its duration"
					icon={Icon.Gauge}
					accessories={[{ tag: `${tunableGlobals().length} settings` }]}
					actions={
						<ActionPanel>
							<Action
								title="Open Global Settings…"
								icon={Icon.Gauge}
								shortcut={{ modifiers: ["ctrl"], key: "return" }}
								onAction={() => push(<HyprimateOptions style={GLOBAL_STYLE} globals />)}
							/>
							<ActionPanel.Section>{configActions()}</ActionPanel.Section>
						</ActionPanel>
					}
				/>
			</List.Section>
			<List.Section title="Switches">
				{SWITCHES.map(({ path, title, hint }) => {
					const on = states.get(path)?.value === true;
					return (
						<List.Item
							key={path}
							title={title}
							subtitle={hint}
							icon={on ? Icon.Switch : Icon.Power}
							accessories={[{ tag: on ? "on" : "off" }]}
							actions={
								<ActionPanel>
									<Action
										title={on ? "Turn Off" : "Turn On"}
										icon={Icon.Switch}
										shortcut={{ modifiers: ["ctrl"], key: "return" }}
										onAction={() => toggle(path)}
									/>
									<Action.CopyToClipboard title="Copy Setting Path" content={optionKey(globalOption(path))} />
									<ActionPanel.Section>{configActions()}</ActionPanel.Section>
								</ActionPanel>
							}
						/>
					);
				})}
				<List.Item
					title="Disable All Effects"
					subtitle="Turn window and workspace effects off without changing the chosen styles"
					icon={Icon.Power}
					accessories={[{ tag: "shortcut ctrl+shift+x" }]}
					actions={<ActionPanel>{configActions()}</ActionPanel>}
				/>
			</List.Section>
			<List.Section title="Config">
				<List.Item
					title="Save to Config"
					subtitle={`Write every set value into ${HYPRIMATE_FILE} and reload`}
					icon={Icon.Download}
					actions={<ActionPanel>{configActions()}</ActionPanel>}
				/>
				<List.Item
					title="Copy Settings as Lua"
					subtitle="Clipboard copy of the same managed block, for your own config file"
					icon={Icon.CopyClipboard}
					actions={<ActionPanel>{configActions()}</ActionPanel>}
				/>
			</List.Section>
			<List.EmptyView title="No matches" icon={Icon.Circle} actions={<ActionPanel>{configActions()}</ActionPanel>} />
		</List>
	);
}
