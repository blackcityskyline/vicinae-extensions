import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	Keyboard,
	List,
	Toast,
	showToast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import {
	type CoreInfo,
	type GeoFile,
	type Group,
	PATHS,
	type Provider,
	type Status,
	type TrafficSample,
	directIp,
	proxiedIp,
	readCore,
	readGeoFiles,
	readGroups,
	readProviders,
	readStatus,
	restartMihomo,
	setMode,
	setRouteMode,
	setRoutingEnabled,
	startMihomo,
	stopMihomo,
	tailLog,
	testConfig,
	testProxy,
	updateAllProviders,
	updateProvider,
	watchTraffic,
} from "~/api/mihomo.ts";
import { ConnectionsView } from "~/components/connections.tsx";
import { NodesView } from "~/components/nodes.tsx";
import { errorText } from "~/utils/error.ts";
import { formatBytes, formatClock, formatDate } from "~/utils/format.ts";

function routingText(routing: Status["routing"]): string {
	if (routing === "proxy") return "routed";
	if (routing === "direct") return "direct";
	return "no MATCH rule";
}

function routingColor(routing: Status["routing"]): Color {
	if (routing === "proxy") return Color.Green;
	if (routing === "direct") return Color.Yellow;
	return Color.SecondaryText;
}

function quotaText(provider: Provider): string | null {
	const subscription = provider.subscription;
	if (!subscription || !subscription.total) return null;
	return `${formatBytes(subscription.upload + subscription.download)} of ${formatBytes(subscription.total)}`;
}

function StatusActions({
	status,
	refresh,
	perform,
}: {
	status: Status;
	refresh: () => Promise<void>;
	perform: (title: string, action: () => Promise<string>) => Promise<void>;
}) {
	const mode = status.mode;
	const otherMode = mode === "tun" ? "proxy" : "tun";
	return (
		<ActionPanel>
			<ActionPanel.Section>
				{status.running ? (
					<Action
						title="Stop mihomo"
						icon={Icon.Stop}
						style={Action.Style.Destructive}
						onAction={() => void perform("Stopping mihomo", stopMihomo)}
					/>
				) : (
					<Action
						title="Start mihomo"
						icon={Icon.Play}
						onAction={() => void perform("Starting mihomo", () => startMihomo(mode))}
					/>
				)}
				{status.running ? (
					<Action
						title="Restart"
						icon={Icon.ArrowClockwise}
						shortcut={{ key: "r", modifiers: ["ctrl", "shift"] }}
						onAction={() => void perform("Restarting mihomo", restartMihomo)}
					/>
				) : null}
			</ActionPanel.Section>
			<ActionPanel.Section title="Mode">
				<Action
					title={otherMode === "tun" ? "Switch to TUN Mode" : "Switch to Proxy Mode"}
					icon={otherMode === "tun" ? Icon.Shield01 : Icon.Globe01}
					onAction={() =>
						void perform(
							otherMode === "tun" ? "Switching to TUN" : "Switching to proxy",
							() => setMode(otherMode),
						)
					}
				/>
				<Action
					title={status.routing === "proxy" ? "Route Direct" : "Route Through Proxy"}
					icon={status.routing === "proxy" ? Icon.Link : Icon.Shield01}
					onAction={() =>
						void perform(
							status.routing === "proxy" ? "Disabling routing" : "Enabling routing",
							() => setRoutingEnabled(status.routing !== "proxy"),
						)
					}
				/>
			</ActionPanel.Section>
			{status.running && status.api ? (
				<ActionPanel.Section title="Mihomo Mode">
					<Action
						title={`${status.routeMode === "rule" ? "✓ " : ""}Rule Mode`}
						icon={Icon.BulletPoints}
						onAction={() => void perform("Switching to rule mode", () => setRouteMode("rule"))}
					/>
					<Action
						title={`${status.routeMode === "global" ? "✓ " : ""}Global Mode`}
						icon={Icon.Globe01}
						onAction={() => void perform("Switching to global mode", () => setRouteMode("global"))}
					/>
					<Action
						title={`${status.routeMode === "direct" ? "✓ " : ""}Direct Mode`}
						icon={Icon.Link}
						onAction={() => void perform("Switching to direct mode", () => setRouteMode("direct"))}
					/>
				</ActionPanel.Section>
			) : null}
			<ActionPanel.Section title="Inspect">
				{status.running && status.api ? (
					<Action.Push
						title="Show Connections"
						icon={Icon.Network}
						target={<ConnectionsView />}
					/>
				) : null}
				{status.running && status.api ? (
					<Action
						title="Test Proxy"
						icon={Icon.Bolt}
						onAction={() =>
							void perform("Testing the proxy", async () => {
								const result = await testProxy();
								return `HTTP ${result.status} in ${result.seconds} s`;
							})
						}
					/>
				) : null}
				{status.running ? <Action.Push title="Check IP" icon={Icon.Map} target={<IpView />} /> : null}
				<Action.Push title="Show Log" icon={Icon.Terminal} target={<LogView />} />
				<Action.Push title="Diagnostics" icon={Icon.Bug} target={<DiagnosticsView />} />
			</ActionPanel.Section>
			<ActionPanel.Section>
				<Action.CopyToClipboard
					title="Copy Proxy Address"
					content={PATHS.proxy}
					icon={Icon.CopyClipboard}
				/>
				<Action.Open title="Open Config" target={PATHS.config} icon={Icon.Cog} />
				<Action
					title="Refresh"
					icon={Icon.ArrowClockwise}
					shortcut={Keyboard.Shortcut.Common.Refresh}
					onAction={() => void refresh()}
				/>
			</ActionPanel.Section>
		</ActionPanel>
	);
}

export default function Command() {
	const [status, setStatus] = useState<Status | null>(null);
	const [groups, setGroups] = useState<Group[]>([]);
	const [providers, setProviders] = useState<Provider[]>([]);
	const [traffic, setTraffic] = useState<TrafficSample | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const next = await readStatus();
			setStatus(next);
			setError(null);
			if (next.api) {
				const [nextGroups, nextProviders] = await Promise.all([readGroups(), readProviders()]);
				setGroups(nextGroups);
				setProviders(nextProviders);
			} else {
				setGroups([]);
				setProviders([]);
			}
		} catch (cause) {
			setError(errorText(cause));
		}
	}, []);

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 2000);
		return () => clearInterval(timer);
	}, [refresh]);

	useEffect(() => watchTraffic(setTraffic), []);

	const perform = useCallback(
		async (title: string, action: () => Promise<string>) => {
			setBusy(true);
			const toast = await showToast({ style: Toast.Style.Animated, title });
			try {
				const message = await action();
				toast.style = Toast.Style.Success;
				toast.title = message;
			} catch (cause) {
				toast.style = Toast.Style.Failure;
				toast.title = `${title} failed`;
				toast.message = errorText(cause);
			} finally {
				setBusy(false);
				await refresh();
			}
		},
		[refresh],
	);

	if (!status) {
		return (
			<List isLoading={!error} navigationTitle="mihomo">
				<List.Item
					title={error ? "Cannot read the mihomo state" : "Reading the mihomo state…"}
					subtitle={error ?? undefined}
					icon={error ? Icon.Warning : Icon.CircleProgress}
					actions={
						error ? (
							<ActionPanel>
								<Action title="Try Again" icon={Icon.ArrowClockwise} onAction={() => void refresh()} />
							</ActionPanel>
						) : undefined
					}
				/>
			</List>
		);
	}

	const running = status.running;
	const mode = status.mode === "tun" ? "TUN" : "Proxy";

	return (
		<List
			isLoading={busy}
			navigationTitle="mihomo"
			searchBarPlaceholder="Filter groups, providers and nodes"
		>
			<List.Section title="Status">
				<List.Item
					title="mihomo"
					subtitle={
						running
							? `${mode} · ${status.routeMode} · ${routingText(status.routing)} · PID ${status.pid}`
							: `Stopped · last mode ${mode}`
					}
					icon={running ? (status.mode === "tun" ? Icon.Shield01 : Icon.Globe01) : Icon.CircleDisabled}
					accessories={[
						{
							tag: { value: running ? "running" : "stopped", color: running ? Color.Green : Color.SecondaryText },
						},
						{ tag: { value: mode, color: status.mode === "tun" ? Color.Blue : Color.Purple } },
						...(running && status.api
							? [
									{
										tag: {
											value: status.routeMode,
											color:
												status.routeMode === "rule"
													? Color.Blue
													: status.routeMode === "global"
														? Color.Purple
														: Color.Yellow,
										},
									},
								]
							: []),
						...(running ? [{ tag: { value: routingText(status.routing), color: routingColor(status.routing) } }] : []),
						...(status.tunLink && running ? [{ tag: { value: "Meta link", color: Color.Green } }] : []),
						...(running && traffic
							? [
									{
										icon: Icon.ArrowDown,
										text: { value: `${formatBytes(traffic.down)}/s` },
										tooltip: `Session ${formatBytes(traffic.downTotal)}`,
									},
									{
										icon: Icon.ArrowUp,
										text: { value: `${formatBytes(traffic.up)}/s` },
										tooltip: `Session ${formatBytes(traffic.upTotal)}`,
									},
								]
							: []),
					]}
					keywords={[mode, status.routeMode, status.routing, running ? "running" : "stopped"]}
					actions={<StatusActions status={status} refresh={refresh} perform={perform} />}
				/>
			</List.Section>

			{groups.length ? (
				<List.Section title="Groups">
					{groups.map((group) => (
						<List.Item
							key={group.name}
							id={`group-${group.name}`}
							title={group.name}
							subtitle={group.now ? `now: ${group.now}` : group.type}
							icon={group.type === "Selector" ? Icon.Switch : Icon.Shuffle}
							keywords={[group.type, group.now]}
							accessories={[
								{ tag: { value: group.type, color: group.type === "Selector" ? Color.Blue : Color.SecondaryText } },
								{ text: { value: `${group.all.length} nodes` } },
							]}
							actions={
								<ActionPanel>
									<Action.Push title="Open Nodes" icon={Icon.CheckList} target={<NodesView group={group.name} />} />
									<Action.CopyToClipboard
										title="Copy Group Name"
										content={group.name}
										shortcut={Keyboard.Shortcut.Common.Copy}
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
			) : null}

			{providers.length ? (
				<List.Section title="Providers">
					{providers.map((provider) => {
						const quota = quotaText(provider);
						return (
							<List.Item
								key={provider.name}
								id={`provider-${provider.name}`}
								title={provider.name}
								subtitle={[`${provider.vehicleType} · ${provider.count} nodes`, quota].filter(Boolean).join(" · ")}
								icon={Icon.Cloud}
								keywords={[provider.vehicleType]}
								accessories={[
									...(provider.subscription?.expire
										? [{ tag: { value: `until ${formatDate(provider.subscription.expire)}`, color: Color.SecondaryText } }]
										: []),
									{ text: { value: formatClock(provider.updatedAt) } },
								]}
								actions={
									<ActionPanel>
										<Action
											title="Update Provider"
											icon={Icon.ArrowClockwise}
											onAction={() =>
												void perform(`Updating ${provider.name}`, () => updateProvider(provider.name))
											}
										/>
										<Action
											title="Update All Providers"
											icon={Icon.ArrowClockwise}
											onAction={() => void perform("Updating all providers", updateAllProviders)}
										/>
										<Action.CopyToClipboard
											title="Copy Provider Name"
											content={provider.name}
											shortcut={Keyboard.Shortcut.Common.Copy}
										/>
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			) : null}
		</List>
	);
}

function IpView() {
	const [rows, setRows] = useState<{ direct: string; proxied: string } | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setChecking(true);
		void (async () => {
			const [direct, proxied] = await Promise.allSettled([directIp(), proxiedIp()]);
			if (cancelled) return;
			setRows({
				direct: direct.status === "fulfilled" ? direct.value : errorText(direct.reason),
				proxied: proxied.status === "fulfilled" ? proxied.value : errorText(proxied.reason),
			});
			setChecking(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [attempt]);

	const table = rows
		? `| Route | Address |\n| --- | --- |\n| Direct | ${rows.direct} |\n| Through proxy | ${rows.proxied} |`
		: "Checking both routes…";

	return (
		<Detail
			navigationTitle="Egress IP"
			isLoading={checking}
			markdown={`# Egress IP\n\nThe proxy is \`${PATHS.proxy}\`.\n\n${table}`}
			actions={
				<ActionPanel>
					<Action
						title="Check Again"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => setAttempt((value) => value + 1)}
					/>
					{rows ? (
						<Action.CopyToClipboard
							title="Copy Direct Address"
							content={rows.direct}
							shortcut={Keyboard.Shortcut.Common.Copy}
						/>
					) : null}
					{rows ? <Action.CopyToClipboard title="Copy Proxy Address" content={rows.proxied} /> : null}
				</ActionPanel>
			}
		/>
	);
}

function LogView() {
	const [text, setText] = useState(tailLog());
	const [auto, setAuto] = useState(true);

	useEffect(() => {
		if (!auto) return;
		const timer = setInterval(() => setText(tailLog()), 2000);
		return () => clearInterval(timer);
	}, [auto]);

	return (
		<Detail
			navigationTitle="mihomo log"
			markdown={`\`\`\`log\n${text}\n\`\`\``}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="File" text={PATHS.log} />
					<Detail.Metadata.Label title="Lines" text={String(text.split("\n").length)} />
					<Detail.Metadata.Label
						title="Auto refresh"
						text={{
							value: auto ? "every 2 s" : "paused",
							color: auto ? Color.Green : Color.SecondaryText,
						}}
					/>
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action
						title="Refresh"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => setText(tailLog())}
					/>
					<Action
						title={auto ? "Pause Auto Refresh" : "Resume Auto Refresh"}
						icon={auto ? Icon.Pause : Icon.Play}
						onAction={() => setAuto((value) => !value)}
					/>
					<Action.CopyToClipboard title="Copy Log" content={text} shortcut={Keyboard.Shortcut.Common.Copy} />
					<Action.Open title="Open Log File" target={PATHS.log} icon={Icon.BlankDocument} />
				</ActionPanel>
			}
		/>
	);
}

function DiagnosticsView() {
	const [core, setCore] = useState<CoreInfo | null>(null);
	const [geo, setGeo] = useState<GeoFile[]>([]);
	const [check, setCheck] = useState<string | null>(null);

	const load = useCallback(async () => {
		setCore(await readCore());
		setGeo(readGeoFiles());
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function verify() {
		const toast = await showToast({ style: Toast.Style.Animated, title: "Testing the config" });
		try {
			const message = await testConfig();
			toast.style = Toast.Style.Success;
			toast.title = message;
			setCheck(message);
		} catch (cause) {
			toast.style = Toast.Style.Failure;
			toast.title = "The config is invalid";
			toast.message = errorText(cause);
			setCheck(errorText(cause));
		}
	}

	return (
		<Detail
			navigationTitle="Diagnostics"
			isLoading={!core}
			markdown={`# Diagnostics\n\n${check ? `Config test: **${check}**` : "Run `Test Config` to check the active config."}`}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label title="Core" text={core?.version ?? "—"} />
					<Detail.Metadata.Label title="Meta" text={core ? (core.meta ? "yes" : "no") : "—"} />
					<Detail.Metadata.Label title="Controller" text={core ? (core.api ? "reachable" : "not reachable") : "—"} />
					<Detail.Metadata.Label title="Config" text={PATHS.config} />
					<Detail.Metadata.Label title="TUN config" text={PATHS.tun} />
					{geo.length ? (
						geo.map((file) => <Detail.Metadata.Label key={file.name} title={file.name} text={formatBytes(file.size)} />)
					) : (
						<Detail.Metadata.Label title="Geo" text="no geo files" />
					)}
					<Detail.Metadata.Label title="Log" text={PATHS.log} />
				</Detail.Metadata>
			}
			actions={
				<ActionPanel>
					<Action title="Test Config" icon={Icon.CheckCircle} onAction={() => void verify()} />
					{core ? (
						<Action.CopyToClipboard
							title="Copy Core Version"
							content={core.version}
							shortcut={Keyboard.Shortcut.Common.Copy}
						/>
					) : null}
					<Action.Open title="Open Config" target={PATHS.config} icon={Icon.Cog} />
					<Action.Open title="Open TUN Config" target={PATHS.tun} icon={Icon.Cog} />
					<Action.Push title="Show Log" icon={Icon.Terminal} target={<LogView />} />
					<Action
						title="Refresh"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => void load()}
					/>
				</ActionPanel>
			}
		/>
	);
}
