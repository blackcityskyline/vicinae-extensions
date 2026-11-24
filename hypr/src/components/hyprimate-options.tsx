/**
 * One style's settings, one animation scope at a time. The scope picker is the
 * whole override story: "Every animation" writes the shared value, the others
 * write the same key under window.open/close/movement, which the plugin gives
 * precedence over the shared value.
 */

import { Action, ActionPanel, Form, Icon, List, Toast, showToast, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import { applyAssignments, applySetting, readOptions } from "~/api/hyprimate.ts";
import type { HyprimateOption } from "~/utils/hyprimate-catalog.ts";
import {
	SCOPE_HINT,
	SCOPE_LABEL,
	SCOPE_ORDER,
	clampValue,
	defaultValue,
	displayValue,
	optionKey,
	optionsFor,
	parseInput,
	rangeText,
	sharedSibling,
	stepOf,
	trimNumber,
	tunableGlobals,
	unitOf,
	workspaceOptionsFor,
	type AnimationScope,
	type OptionState,
	type StyleInfo,
} from "~/utils/hyprimate.ts";

const ICONS: Record<string, Icon> = {
	boolean: Icon.Switch,
	int: Icon.Gauge,
	float: Icon.Gauge,
	color: Icon.Droplets,
	string: Icon.Layers,
	set: Icon.Layers,
};

function firstSentence(text: string): string {
	const match = /^.*?[.]\s/u.exec(text);
	const sentence = match ? match[0].trim() : text;
	return sentence.length > 120 ? `${sentence.slice(0, 117)}…` : sentence;
}

function valueOf(option: HyprimateOption, state: OptionState | null): string | number | boolean | undefined {
	return state?.value ?? defaultValue(option);
}

function asNumber(option: HyprimateOption, state: OptionState | null): number {
	const value = valueOf(option, state);
	if (typeof value === "number") return value;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

interface FormProps {
	option: HyprimateOption;
	scope: AnimationScope | null;
	current: OptionState | null;
	onSubmitted: (value: string | number | boolean) => void;
}

function OptionForm({ option, scope, current, onSubmitted }: FormProps) {
	const { pop } = useNavigation();
	const initial = current ? displayValue(option, current.value) : displayValue(option, defaultValue(option));
	const [text, setText] = useState(initial);

	async function submit() {
		const parsed = parseInput(option, text);
		if (!parsed.ok || parsed.value === undefined) {
			await showToast({ style: Toast.Style.Failure, title: "Not a valid value", message: parsed.error ?? "" });
			return;
		}
		const result = await applySetting(option, parsed.value);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not set ${option.label}`, message: result.error });
			return;
		}
		onSubmitted(parsed.value);
		await showToast({
			style: Toast.Style.Success,
			title: `${option.label} = ${displayValue(option, parsed.value)}`,
			message: `${option.path}${scope ? ` · ${SCOPE_LABEL[scope]}` : ""}`,
		});
		pop();
	}

	const info = [option.description, rangeText(option) ? `Allowed: ${rangeText(option)}` : ""].filter(Boolean).join(" ");

	return (
		<Form
			navigationTitle={option.label}
			actions={
				<ActionPanel>
					<Action.SubmitForm title="Apply" icon={Icon.Check} shortcut="save" onSubmit={submit} />
				</ActionPanel>
			}
		>
			{option.choices && option.type !== "set" ? (
				<Form.Dropdown id="value" title={option.label} value={text} onChange={setText} info={info}>
					{option.choices.map((choice) => (
						<Form.Dropdown.Item key={choice} title={choice} value={choice} />
					))}
				</Form.Dropdown>
			) : (
				<Form.TextField
					id="value"
					title={option.label}
					value={text}
					onChange={setText}
					placeholder={option.type === "color" ? "#aarrggbb" : String(option.default)}
					info={info}
				/>
			)}
			<Form.Separator />
			<Form.Description title="Setting" text={optionKey(option)} />
			{unitOf(option) ? <Form.Description title="Unit" text={unitOf(option)} /> : null}
			{rangeText(option) ? <Form.Description title="Range" text={rangeText(option)} /> : null}
		</Form>
	);
}

interface Props {
	style: StyleInfo;
	/** Workspace styles have no animation scopes. */
	workspace?: boolean;
	/** Global switches and external effect settings, which have no style. */
	globals?: boolean;
}

export function HyprimateOptions({ style, workspace = false, globals = false }: Props) {
	const { push } = useNavigation();
	const [scope, setScope] = useState<AnimationScope>("shared");
	const [states, setStates] = useState<Map<string, OptionState | null>>(new Map());
	const [loading, setLoading] = useState(true);

	const options = globals
		? tunableGlobals()
		: workspace
			? workspaceOptionsFor(style.slug)
			: optionsFor(style.slug, scope);
	const siblings =
		globals || workspace || scope === "shared" ? [] : options.map(sharedSibling).filter((option) => option !== undefined);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			setLoading(true);
			const loaded = await readOptions([...options, ...siblings]);
			if (cancelled) return;
			setStates(loaded);
			setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
		// options and siblings are derived from the same inputs.
	}, [style.slug, scope, workspace, globals]);

	function remember(option: HyprimateOption, value: string | number | boolean) {
		setStates((previous) => new Map(previous).set(option.path, { value, set: true }));
	}

	async function commit(option: HyprimateOption, value: string | number | boolean, title: string) {
		const result = await applySetting(option, value);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: `Could not set ${option.label}`, message: result.error });
			return;
		}
		remember(option, value);
		await showToast({ style: Toast.Style.Success, title, message: `${option.path} = ${displayValue(option, value)}` });
	}

	async function nudge(option: HyprimateOption, direction: 1 | -1) {
		const current = asNumber(option, states.get(option.path) ?? null);
		const next = clampValue(option, current + direction * stepOf(option));
		if (next === current) return;
		await commit(option, next, `${option.label} ${direction > 0 ? "+" : "−"}${trimNumber(stepOf(option))}`);
	}

	async function resetToDefault(option: HyprimateOption) {
		await commit(option, defaultValue(option), `${option.label} reset`);
	}

	async function resetScope() {
		const assignments = options.map((option) => ({ option, value: defaultValue(option) }));
		const result = await applyAssignments(assignments);
		if (!result.ok) {
			await showToast({ style: Toast.Style.Failure, title: "Could not reset this scope", message: result.error });
			return;
		}
		setStates((previous) => {
			const next = new Map(previous);
			for (const option of options) next.set(option.path, { value: defaultValue(option), set: true });
			return next;
		});
		await showToast({
			style: Toast.Style.Success,
			title: `${style.name} reset`,
			message: `${options.length} ${workspace || globals ? "" : `${SCOPE_LABEL[scope].toLowerCase()} `}settings back to the plugin defaults`,
		});
	}

	function actions(option: HyprimateOption) {
		const state = states.get(option.path) ?? null;
		const numeric = option.type === "float" || option.type === "int";
		const toggle = option.type === "boolean";
		return (
			<ActionPanel>
				{toggle ? (
					<Action
						title={state?.value === true ? "Turn Off" : "Turn On"}
						icon={Icon.Switch}
						shortcut={{ modifiers: ["ctrl"], key: "return" }}
						onAction={() => {
							void commit(option, state?.value !== true, option.label);
						}}
					/>
				) : (
					<Action
						title="Set Value…"
						icon={Icon.Pencil}
						shortcut={{ modifiers: ["ctrl"], key: "return" }}
						onAction={() => {
							push(
								<OptionForm
									option={option}
									scope={workspace ? null : scope}
									current={state}
									onSubmitted={(value) => remember(option, value)}
								/>,
							);
						}}
					/>
				)}
				{numeric ? (
					<ActionPanel.Section>
						<Action
							title={`Increase by ${trimNumber(stepOf(option))}`}
							icon={Icon.ArrowUp}
							shortcut={{ modifiers: ["ctrl"], key: "arrowUp" }}
							onAction={() => {
								void nudge(option, 1);
							}}
						/>
						<Action
							title={`Decrease by ${trimNumber(stepOf(option))}`}
							icon={Icon.ArrowDown}
							shortcut={{ modifiers: ["ctrl"], key: "arrowDown" }}
							onAction={() => {
								void nudge(option, -1);
							}}
						/>
					</ActionPanel.Section>
				) : null}
				<ActionPanel.Section>
					<Action
						title="Reset to Default"
						icon={Icon.ArrowCounterClockwise}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
						onAction={() => {
							void resetToDefault(option);
						}}
					/>
					<Action
						title={
							workspace || globals ? "Reset All to Default" : `Reset ${SCOPE_LABEL[scope]} to Default`
						}
						icon={Icon.Trash}
						shortcut={{ modifiers: ["ctrl", "shift"], key: "d" }}
						onAction={() => {
							void resetScope();
						}}
					/>
					<Action.CopyToClipboard title="Copy Setting Path" content={optionKey(option)} />
				</ActionPanel.Section>
			</ActionPanel>
		);
	}

	function item(option: HyprimateOption) {
		const state = states.get(option.path) ?? null;
		const sibling = workspace || globals ? undefined : sharedSibling(option);
		const inherited = sibling ? (states.get(sibling.path) ?? null) : null;
		const shown = state ?? inherited;
		const value = shown ? displayValue(option, shown.value) : "—";
		const accessories: { tag?: string; text?: string }[] = [{ text: value }];
		if (state?.set) accessories.push({ tag: "set" });
		else if (inherited?.set) accessories.push({ tag: "inherited" });
		return (
			<List.Item
				key={option.path}
				title={option.label}
				subtitle={firstSentence(option.description)}
				keywords={[option.path, option.key, globals ? "global" : SCOPE_LABEL[scope]]}
				icon={ICONS[option.type] ?? Icon.Circle}
				accessories={accessories}
				actions={actions(option)}
			/>
		);
	}

	return (
		<List
			isLoading={loading}
			navigationTitle={`${style.name}${workspace || globals ? "" : ` · ${SCOPE_LABEL[scope]}`}`}
			searchBarPlaceholder={`Search ${style.name.toLowerCase()} settings`}
			searchBarAccessory={
				workspace || globals ? undefined : (
					<List.Dropdown tooltip={SCOPE_HINT[scope]} value={scope} onChange={(value) => setScope(value as AnimationScope)}>
						{SCOPE_ORDER.map((candidate) => (
							<List.Dropdown.Item key={candidate} value={candidate} title={SCOPE_LABEL[candidate]} />
						))}
					</List.Dropdown>
				)
			}
		>
			{options.length === 0 ? (
				<List.EmptyView title="Nothing here" description="There are no settings in this group." icon={Icon.Circle} />
			) : (
				<List.Section title={globals ? style.name : `${style.name} · ${workspace ? "workspace" : SCOPE_LABEL[scope]}`}>
					{options.map(item)}
				</List.Section>
			)}
		</List>
	);
}
