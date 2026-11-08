import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import {
	delayGroup,
	lastDelay,
	readGroup,
	readProxies,
	selectNode,
	type Group,
	type ProxyEntry,
} from "~/api/mihomo.ts";
import { sortNodes } from "~/utils/config.ts";
import { errorText } from "~/utils/error.ts";
import { formatDelay } from "~/utils/format.ts";

type SortMode = "delay" | "alive" | "name";

function delayColor(ms: number | undefined, alive: boolean | undefined): Color {
	if (!ms) return alive === false ? Color.Red : Color.SecondaryText;
	if (ms <= 250) return Color.Green;
	if (ms <= 450) return Color.Yellow;
	return Color.Red;
}

function delayText(ms: number | undefined, alive: boolean | undefined): string {
	if (ms === 0) return "timeout";
	return formatDelay(ms);
}

function flags(entry: ProxyEntry | undefined): string[] {
	return [entry?.udp ? "UDP" : null, entry?.tfo ? "TFO" : null, entry?.mptcp ? "MPTCP" : null].filter(
		(value): value is string => Boolean(value),
	);
}

export function NodesView({ group: groupName }: { group: string }) {
	const [group, setGroup] = useState<Group | null>(null);
	const [proxies, setProxies] = useState<Record<string, ProxyEntry>>({});
	const [delays, setDelays] = useState<Record<string, number | undefined>>({});
	const [order, setOrder] = useState<SortMode>("delay");
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

	const names = group?.all ?? [];
	const measured: Record<string, number | undefined> = {};
	for (const node of names) measured[node] = delays[node] ?? lastDelay(proxies[node]);
	const sorted = sortNodes(names, measured);
	const nodes =
		order === "name"
			? [...sorted].sort((left, right) => left.localeCompare(right))
			: order === "alive"
				? [...sorted].sort(
						(left, right) => Number(proxies[right]?.alive ?? false) - Number(proxies[left]?.alive ?? false),
					)
				: sorted;

	return (
		<List
			navigationTitle={group?.name ?? groupName}
			isLoading={loading}
			isShowingDetail
			searchBarPlaceholder="Filter nodes"
			searchBarAccessory={
				<List.Dropdown tooltip="Sort nodes" value={order} storeValue onChange={(value) => setOrder(value as SortMode)}>
					<List.Dropdown.Item title="Fastest first" value="delay" icon={Icon.Bolt} />
					<List.Dropdown.Item title="Alive first" value="alive" icon={Icon.CheckCircle} />
					<List.Dropdown.Item title="Name" value="name" icon={Icon.Text} />
				</List.Dropdown>
			}
		>
			{error ? (
				<List.EmptyView
					icon={Icon.Warning}
					title="Cannot read this group"
					description={error}
					actions={
						<ActionPanel>
							<Action title="Try Again" icon={Icon.ArrowClockwise} onAction={() => void load(true)} />
						</ActionPanel>
					}
				/>
			) : !loading && !nodes.length ? (
				<List.EmptyView icon={Icon.CircleDisabled} title="No nodes" description="This group has no members." />
			) : (
				<List.Section title={`${nodes.length} nodes${group?.now ? ` · ${group.now}` : ""}`}>
					{nodes.map((node) => {
						const entry = proxies[node];
						const ms = measured[node];
						const alive = entry?.alive;
						const current = group?.now === node;
						const selectable = group?.type === "Selector";
						const subtitle = [entry?.type, entry?.provider, flags(entry).join(" ")]
							.filter(Boolean)
							.join(" · ");
						return (
							<List.Item
								key={node}
								id={node}
								title={node}
								subtitle={subtitle || undefined}
								active={current}
								icon={
									current
										? Icon.CheckCircle
										: { source: Icon.Dot, tintColor: alive === false ? Color.Red : Color.Green }
								}
								keywords={[entry?.type ?? "", entry?.provider ?? "", ...flags(entry)]}
								accessories={[
									{
										tag: { value: delayText(ms, alive), color: delayColor(ms, alive) },
										tooltip: alive === false ? "The last health check failed" : "Delay to the test URL",
									},
								]}
								detail={
									<List.Item.Detail
										markdown={`## ${node}\n\n${current ? "Selected in this group." : "Not selected in this group."}${
											group?.testUrl ? `\n\nTest URL: \`${group.testUrl}\`` : ""
										}`}
										metadata={
											<List.Item.Detail.Metadata>
												<List.Item.Detail.Metadata.Label title="Type" text={entry?.type || "—"} />
												<List.Item.Detail.Metadata.Label title="Provider" text={entry?.provider || "—"} />
												{entry?.dialer ? (
													<List.Item.Detail.Metadata.Label title="Dialer proxy" text={entry.dialer} />
												) : null}
												<List.Item.Detail.Metadata.Label
													title="Last check"
													text={{
														value: delayText(ms, alive),
														color: delayColor(ms, alive),
													}}
													icon={Icon.Gauge}
												/>
												<List.Item.Detail.Metadata.Label
													title="Health"
													text={{
														value: alive === false ? "failing" : "reachable",
														color: alive === false ? Color.Red : Color.Green,
													}}
												/>
												<List.Item.Detail.Metadata.TagList title="Capabilities">
													{flags(entry).length ? (
														flags(entry).map((flag) => (
															<List.Item.Detail.Metadata.TagList.Item
																key={flag}
																text={flag}
																color={Color.Blue}
															/>
														))
													) : (
														<List.Item.Detail.Metadata.TagList.Item text="none" color={Color.SecondaryText} />
													)}
												</List.Item.Detail.Metadata.TagList>
											</List.Item.Detail.Metadata>
										}
									/>
								}
								actions={
									<ActionPanel>
										{selectable ? (
											<Action title="Select Node" icon={Icon.Check} onAction={() => void choose(node)} />
										) : null}
										<Action
											title="Test All Nodes"
											icon={Icon.Bolt}
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
					})}
				</List.Section>
			)}
		</List>
	);
}
