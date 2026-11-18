import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	closeAllConnections,
	closeConnection,
	enableProcessNames,
	readConnections,
	type Connection,
	type ConnectionsSnapshot,
} from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";
import { formatBytes, formatDuration } from "~/utils/format.ts";
import {
	byRate,
	perProcess,
	rateTracker,
	routingOf,
	type ConnectionCounters,
	type Rate,
	type RateTracker,
} from "~/utils/traffic.ts";

/** The controller flushes its counters every few seconds; one poll a second keeps the rates close. */
const POLL_MS = 1000;

function age(start: string): string {
	const started = Date.parse(start);
	if (Number.isNaN(started)) return "—";
	return formatDuration((Date.now() - started) / 1000);
}

function chainText(connection: Connection): string {
	return connection.chains.length ? connection.chains.join(" → ") : "—";
}

function speed(bytes: number): string {
	return `${formatBytes(bytes)}/s`;
}

function routingTag(routing: string) {
	const color =
		routing === "direct" ? Color.SecondaryText : routing === "proxy" ? Color.Blue : Color.Purple;
	return { tag: { value: routing, color } };
}

export function TrafficView() {
	const [snapshot, setSnapshot] = useState<ConnectionsSnapshot | null>(null);
	const [rates, setRates] = useState<Map<string, Rate>>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const tracker = useRef<RateTracker | null>(null);

	const refresh = useCallback(async () => {
		try {
			const next = await readConnections();
			const at = Date.now();
			const counters = new Map<string, ConnectionCounters>(
				next.connections.map((connection) => [
					connection.id,
					{ id: connection.id, upload: connection.upload, download: connection.download },
				]),
			);
			const measured = (tracker.current ??= rateTracker());
			setRates(measured.tick([...counters.values()], at));
			setSnapshot(next);
			setError(null);
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), POLL_MS);
		return () => clearInterval(timer);
	}, [refresh]);

	async function close(connection: Connection) {
		const toast = await showToast({ style: Toast.Style.Animated, title: `Closing ${connection.host}` });
		try {
			await closeConnection(connection.id);
			toast.style = Toast.Style.Success;
			toast.title = "Connection closed";
			await refresh();
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not close the connection";
			toast.message = errorText(cause);
		}
	}

	async function closeAll() {
		const toast = await showToast({ style: Toast.Style.Animated, title: "Closing all connections" });
		try {
			await closeAllConnections();
			toast.style = Toast.Style.Success;
			toast.title = "All connections closed";
			await refresh();
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not close the connections";
			toast.message = errorText(cause);
		}
	}

	async function turnOnProcessNames() {
		const toast = await showToast({ style: Toast.Style.Animated, title: "Enabling process names" });
		try {
			toast.title = await enableProcessNames();
			toast.style = Toast.Style.Success;
			await refresh();
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "Could not enable process names";
			toast.message = errorText(cause);
		}
	}

	const rows = snapshot?.connections ?? [];
	const tracked = rows.map((connection) => ({ ...connection }));
	const processes = perProcess(tracked, rates);
	const connections = byRate(tracked, rates);
	const down = rows.reduce((sum, connection) => sum + (rates.get(connection.id)?.down ?? 0), 0);
	const up = rows.reduce((sum, connection) => sum + (rates.get(connection.id)?.up ?? 0), 0);
	// Without `find-process-mode: always` the controller names no process at all.
	const unnamed = rows.length > 0 && rows.every((connection) => !connection.process);

	return (
		<List
			navigationTitle="Traffic"
			isLoading={loading}
			isShowingDetail
			searchBarPlaceholder="Filter by process, host or rule"
		>
			{error ? (
				<List.EmptyView icon={Icon.Warning} title="Cannot read connections" description={error} />
			) : !rows.length ? (
				<List.EmptyView
					icon={Icon.Network}
					title="No active connections"
					description="Nothing is going through the proxy port right now."
				/>
			) : (
				<>
					<List.Section
						title={`Live · ↓ ${speed(down)} · ↑ ${speed(up)} · session ↓ ${formatBytes(snapshot?.downloadTotal)} · ↑ ${formatBytes(snapshot?.uploadTotal)}`}
					>
						{processes.map((group) => (
							<List.Item
								key={`process-${group.name}`}
								id={`process-${group.name}`}
								title={group.name}
								subtitle={[group.hosts.slice(0, 3).join(", "), `${group.connections} conn`]
									.filter(Boolean)
									.join(" · ")}
								icon={Icon.AppWindow}
								keywords={[group.name, group.routing, ...group.hosts]}
								accessories={[
									{ icon: Icon.ArrowDown, text: { value: speed(group.down) } },
									{ icon: Icon.ArrowUp, text: { value: speed(group.up) } },
									routingTag(group.routing),
								]}
								detail={
									<List.Item.Detail
										metadata={
											<List.Item.Detail.Metadata>
												<List.Item.Detail.Metadata.Label title="Process" text={group.name} />
												<List.Item.Detail.Metadata.Label title="Routing" text={group.routing} />
												<List.Item.Detail.Metadata.Label
													title="Now"
													text={`↓ ${speed(group.down)} · ↑ ${speed(group.up)}`}
												/>
												<List.Item.Detail.Metadata.Label
													title="Session"
													text={`↓ ${formatBytes(group.downTotal)} · ↑ ${formatBytes(group.upTotal)}`}
												/>
												<List.Item.Detail.Metadata.Label
													title="Connections"
													text={String(group.connections)}
												/>
												{group.hosts.map((host) => (
													<List.Item.Detail.Metadata.Label key={host} title="Host" text={host} />
												))}
											</List.Item.Detail.Metadata>
										}
									/>
								}
								actions={
									<ActionPanel>
										{unnamed ? (
											<Action
												title="Enable Process Names"
												icon={Icon.Cog}
												shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
												onAction={() => void turnOnProcessNames()}
											/>
										) : null}
										<Action.CopyToClipboard
											title="Copy Process"
											content={group.name}
											shortcut={Keyboard.Shortcut.Common.Copy}
										/>
										<Action.CopyToClipboard
											title="Copy Hosts"
											content={group.hosts.join("\n")}
											shortcut="copy-path"
										/>
										<Action
											title="Refresh"
											icon={Icon.ArrowClockwise}
											shortcut={Keyboard.Shortcut.Common.Refresh}
											onAction={() => void refresh()}
										/>
									</ActionPanel>
								}
							/>
						))}
					</List.Section>

					<List.Section title={`Connections · ${rows.length}`}>
						{connections.map((connection) => {
							const rate = rates.get(connection.id);
							return (
								<List.Item
									key={connection.id}
									id={connection.id}
									title={connection.host}
									subtitle={[connection.process, connection.rule, connection.chains[0]]
										.filter(Boolean)
										.join(" · ")}
									icon={{ source: Icon.Globe01, tintColor: connection.geo ? Color.Blue : Color.SecondaryText }}
									keywords={[connection.process, connection.rule, connection.destination, connection.geo ?? ""]}
									accessories={[
										{ icon: Icon.ArrowDown, text: { value: speed(rate?.down ?? 0) } },
										{ icon: Icon.ArrowUp, text: { value: speed(rate?.up ?? 0) } },
										routingTag(routingOf(connection.chains)),
										{ tag: { value: age(connection.start), color: Color.SecondaryText } },
									]}
									detail={
										<List.Item.Detail
											markdown={`## ${connection.host}\n\n\`${connection.destination}\``}
											metadata={
												<List.Item.Detail.Metadata>
													<List.Item.Detail.Metadata.Label title="Destination" text={connection.destination} />
													<List.Item.Detail.Metadata.Label
														title="Process"
														text={connection.process || "—"}
													/>
													<List.Item.Detail.Metadata.Label title="Rule" text={connection.rule || "—"} />
													<List.Item.Detail.Metadata.Label title="Chain" text={chainText(connection)} />
													<List.Item.Detail.Metadata.Label
														title="Routing"
														text={routingOf(connection.chains)}
													/>
													<List.Item.Detail.Metadata.Label
														title="Now"
														text={`↓ ${speed(rate?.down ?? 0)} · ↑ ${speed(rate?.up ?? 0)}`}
													/>
													<List.Item.Detail.Metadata.Label
														title="Network"
														text={[connection.network, connection.type].filter(Boolean).join(" · ") || "—"}
													/>
													{connection.geo ? (
														<List.Item.Detail.Metadata.Label title="Geolocation" text={connection.geo} />
													) : null}
													<List.Item.Detail.Metadata.Label
														title="Downloaded"
														text={formatBytes(connection.download)}
													/>
													<List.Item.Detail.Metadata.Label
														title="Uploaded"
														text={formatBytes(connection.upload)}
													/>
													<List.Item.Detail.Metadata.Label
														title="Started"
														text={`${age(connection.start)} ago`}
													/>
												</List.Item.Detail.Metadata>
											}
										/>
									}
									actions={
										<ActionPanel>
											<Action
												title="Close Connection"
												shortcut="remove"
												icon={Icon.XMarkCircle}
												style={Action.Style.Destructive}
												onAction={() => void close(connection)}
											/>
											<Action
												title="Close All Connections"
												shortcut="remove-all"
												icon={Icon.Trash}
												style={Action.Style.Destructive}
												onAction={() => void closeAll()}
											/>
											{unnamed ? (
												<Action
													title="Enable Process Names"
													icon={Icon.Cog}
													shortcut={{ modifiers: ["ctrl", "shift"], key: "e" }}
													onAction={() => void turnOnProcessNames()}
												/>
											) : null}
											<Action.CopyToClipboard
												title="Copy Host"
												content={connection.host}
												shortcut={Keyboard.Shortcut.Common.Copy}
											/>
											<Action.CopyToClipboard
												title="Copy Destination"
												shortcut="copy"
												content={connection.destination}
											/>
											<Action.CopyToClipboard
												title="Copy Chain"
												shortcut={{ modifiers: ["ctrl"], key: "a" }}
												content={chainText(connection)}
											/>
											<Action
												title="Refresh"
												icon={Icon.ArrowClockwise}
												shortcut={Keyboard.Shortcut.Common.Refresh}
												onAction={() => void refresh()}
											/>
										</ActionPanel>
									}
								/>
							);
						})}
					</List.Section>
				</>
			)}
		</List>
	);
}
