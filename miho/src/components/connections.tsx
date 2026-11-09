import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, showToast } from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import { closeAllConnections, closeConnection, readConnections, type Connection, type ConnectionsSnapshot } from "~/api/mihomo.ts";
import { errorText } from "~/utils/error.ts";
import { formatBytes, formatDuration } from "~/utils/format.ts";

function age(start: string): string {
	const started = Date.parse(start);
	if (Number.isNaN(started)) return "—";
	return formatDuration((Date.now() - started) / 1000);
}

function chainText(connection: Connection): string {
	return connection.chains.length ? connection.chains.join(" → ") : "—";
}

export function ConnectionsView() {
	const [snapshot, setSnapshot] = useState<ConnectionsSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			setSnapshot(await readConnections());
			setError(null);
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 2000);
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

	const rows = snapshot?.connections ?? [];

	return (
		<List
			navigationTitle="Connections"
			isLoading={loading}
			isShowingDetail
			searchBarPlaceholder="Filter by host, process or rule"
		>
			{error ? (
				<List.EmptyView icon={Icon.Warning} title="Cannot read connections" description={error} />
			) : !rows.length ? (
				<List.EmptyView
					icon={Icon.Network}
					title="No active connections"
					description="Traffic that goes through the proxy appears here."
				/>
			) : (
				<List.Section
					title={`Active · ↓ ${formatBytes(snapshot?.downloadTotal)} · ↑ ${formatBytes(snapshot?.uploadTotal)}`}
				>
					{rows.map((connection) => (
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
								{ icon: Icon.ArrowDown, text: { value: formatBytes(connection.download) } },
								{ icon: Icon.ArrowUp, text: { value: formatBytes(connection.upload) } },
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
										title="Close Connection" shortcut="remove"
										icon={Icon.XMarkCircle}
										style={Action.Style.Destructive}
										onAction={() => void close(connection)}
									/>
									<Action
										title="Close All Connections" shortcut="remove-all"
										icon={Icon.Trash}
										style={Action.Style.Destructive}
										onAction={() => void closeAll()}
									/>
									<Action.CopyToClipboard
										title="Copy Host"
										content={connection.host}
										shortcut={Keyboard.Shortcut.Common.Copy}
									/>
									<Action.CopyToClipboard title="Copy Destination" shortcut="copy" content={connection.destination} />
									<Action.CopyToClipboard title="Copy Chain" shortcut={{ modifiers: ["ctrl"], key: "a" }} content={chainText(connection)} />
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
			)}
		</List>
	);
}
