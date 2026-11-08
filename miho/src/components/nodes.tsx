import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { delayGroup, readGroup, readProxies, selectNode, type Group, type ProxyEntry } from "~/api/mihomo.ts";
import { sortNodes } from "~/utils/config.ts";
import { errorText } from "~/utils/error.ts";
import { formatDelay } from "~/utils/format.ts";

function delayColor(ms: number | undefined): Color {
	if (!ms) return Color.SecondaryText;
	if (ms <= 250) return Color.Green;
	if (ms <= 450) return Color.Yellow;
	return Color.Red;
}

export function NodesView({ group: groupName }: { group: string }) {
	const [group, setGroup] = useState<Group | null>(null);
	const [proxies, setProxies] = useState<Record<string, ProxyEntry>>({});
	const [delays, setDelays] = useState<Record<string, number | undefined>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(
		async (ping: boolean) => {
			setLoading(true);
			try {
				const current = await readGroup(groupName);
				setGroup(current);
				setProxies(await readProxies());
				if (ping) {
					try {
						setDelays(await delayGroup(groupName, current.testUrl));
					} catch {
						setDelays({});
					}
				}
				setError(null);
			} catch (cause) {
				setError(errorText(cause));
			} finally {
				setLoading(false);
			}
		},
		[groupName],
	);

	useEffect(() => {
		void load(true);
	}, [load]);

	async function choose(node: string) {
		const toast = await showToast({ style: Toast.Style.Animated, title: `Selecting ${node}` });
		try {
			await selectNode(groupName, node);
			toast.style = Toast.Style.Success;
			toast.title = `Selected ${node}`;
			await load(false);
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not select the node";
			toast.message = errorText(cause);
		}
	}

	const nodes = sortNodes(group?.all ?? [], delays);

	return (
		<List
			navigationTitle={group?.name ?? groupName}
			isLoading={loading}
			searchBarPlaceholder="Filter nodes"
		>
			{error ? (
				<List.Item
					title="Cannot read this group"
					subtitle={error}
					icon={Icon.Warning}
					actions={
						<ActionPanel>
							<Action title="Try Again" icon={Icon.ArrowClockwise} onAction={() => void load(true)} />
						</ActionPanel>
					}
				/>
			) : (
				nodes.map((node) => {
					const entry = proxies[node];
					const ms = delays[node];
					const current = group?.now === node;
					const selectable = group?.type === "Selector";
					const subtitle = [entry?.type, entry?.udp ? "UDP" : null].filter(Boolean).join(" · ");
					return (
						<List.Item
							key={node}
							id={node}
							title={node}
							subtitle={subtitle || undefined}
							icon={current ? Icon.CheckCircle : Icon.Dot}
							keywords={entry?.type ? [entry.type] : []}
							accessories={[{ tag: { value: formatDelay(ms), color: delayColor(ms) } }]}
							actions={
								<ActionPanel>
									{selectable ? (
										<Action title="Select Node" icon={Icon.Check} onAction={() => void choose(node)} />
									) : null}
									<Action
										title="Test All Nodes"
										icon={Icon.ArrowClockwise}
										shortcut={Keyboard.Shortcut.Common.Refresh}
										onAction={() => void load(true)}
									/>
									<Action.CopyToClipboard
										title="Copy Node Name"
										content={node}
										shortcut={Keyboard.Shortcut.Common.Copy}
									/>
								</ActionPanel>
							}
						/>
					);
				})
			)}
		</List>
	);
}
