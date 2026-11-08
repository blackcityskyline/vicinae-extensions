import {
	Action,
	ActionPanel,
	Color,
	Detail,
	Icon,
	Keyboard,
	List,
	Toast,
	runInTerminal,
	showToast,
} from "@vicinae/api";
import { useCallback, useEffect, useState } from "react";

import {
	type Group,
	type Provider,
	type Status,
	directIp,
	proxiedIp,
	readGroups,
	readProviders,
	readStatus,
	restartMihomo,
	setMode,
	setRoutingEnabled,
	startMihomo,
	stopMihomo,
	tailLog,
	testProxy,
	updateProvider,
} from "~/api/mihomo.ts";
import { NodesView } from "~/components/nodes.tsx";
import { errorText } from "~/utils/error.ts";
import { formatClock } from "~/utils/format.ts";

function routingText(routing: Status["routing"]): string {
	if (routing === "proxy") return "routed";
	if (routing === "direct") return "direct";
	return "no MATCH rule";
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
			{status.running ? (
				<Action title="Stop mihomo" icon={Icon.Stop} onAction={() => void perform("Stopping mihomo", stopMihomo)} />
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
			{status.running ? (
				<Action.Push title="Check IP" icon={Icon.Map} target={<IpView />} />
			) : null}
			<Action.Push title="Show Log" icon={Icon.Terminal} target={<LogView />} />
			<Action
				title="Authorize Sudo…"
				icon={Icon.Lock}
				onAction={() => {
					void runInTerminal(["sudo", "-v"], { hold: true });
					void showToast({
						style: Toast.Style.Success,
						title: "Enter your password in the terminal",
						message: "TUN mode and stopping a root daemon need it.",
					});
				}}
			/>
			<Action
				title="Refresh"
				icon={Icon.ArrowClockwise}
				shortcut={Keyboard.Shortcut.Common.Refresh}
				onAction={() => void refresh()}
			/>
		</ActionPanel>
	);
}

export default function Command() {
	const [status, setStatus] = useState<Status | null>(null);
	const [groups, setGroups] = useState<Group[]>([]);
	const [providers, setProviders] = useState<Provider[]>([]);
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
							? `${mode} · ${routingText(status.routing)} · PID ${status.pid}`
							: `Stopped · last mode ${mode}`
					}
					icon={running ? Icon.Globe01 : Icon.CircleDisabled}
					accessories={[
						{
							tag: { value: running ? "running" : "stopped", color: running ? Color.Green : Color.SecondaryText },
						},
						{ tag: { value: mode, color: status.mode === "tun" ? Color.Blue : Color.Purple } },
						...(status.tunLink && running ? [{ tag: { value: "Meta link", color: Color.Green } }] : []),
					]}
					keywords={[mode, status.routing, running ? "running" : "stopped"]}
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
					{providers.map((provider) => (
						<List.Item
							key={provider.name}
							id={`provider-${provider.name}`}
							title={provider.name}
							subtitle={`${provider.vehicleType} · ${provider.count} nodes`}
							icon={Icon.Cloud}
							keywords={[provider.vehicleType]}
							accessories={[{ text: { value: formatClock(provider.updatedAt) } }]}
							actions={
								<ActionPanel>
									<Action
										title="Update Provider"
										icon={Icon.ArrowClockwise}
										onAction={() =>
											void perform(`Updating ${provider.name}`, () => updateProvider(provider.name))
										}
									/>
									<Action.CopyToClipboard
										title="Copy Provider Name"
										content={provider.name}
										shortcut={Keyboard.Shortcut.Common.Copy}
									/>
								</ActionPanel>
							}
						/>
					))}
				</List.Section>
			) : null}
		</List>
	);
}

function IpView() {
	const [rows, setRows] = useState<{ direct: string; proxied: string } | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [direct, proxied] = await Promise.allSettled([directIp(), proxiedIp()]);
			if (cancelled) return;
			setRows({
				direct: direct.status === "fulfilled" ? direct.value : errorText(direct.reason),
				proxied: proxied.status === "fulfilled" ? proxied.value : errorText(proxied.reason),
			});
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const table = rows
		? `| Route | Address |\n| --- | --- |\n| Direct | ${rows.direct} |\n| Through proxy | ${rows.proxied} |`
		: "Checking both routes…";

	return (
		<Detail
			navigationTitle="Egress IP"
			isLoading={!rows}
			markdown={`# Egress IP\n\n${table}`}
			actions={
				rows ? (
					<ActionPanel>
						<Action.CopyToClipboard
							title="Copy Direct Address"
							content={rows.direct}
							shortcut={Keyboard.Shortcut.Common.Copy}
						/>
						<Action.CopyToClipboard title="Copy Proxy Address" content={rows.proxied} />
					</ActionPanel>
				) : undefined
			}
		/>
	);
}

function LogView() {
	const [text, setText] = useState(tailLog());

	return (
		<Detail
			navigationTitle="mihomo log"
			markdown={`\`\`\`log\n${text}\n\`\`\``}
			actions={
				<ActionPanel>
					<Action
						title="Refresh"
						icon={Icon.ArrowClockwise}
						shortcut={Keyboard.Shortcut.Common.Refresh}
						onAction={() => setText(tailLog())}
					/>
					<Action.CopyToClipboard title="Copy Log" content={text} shortcut={Keyboard.Shortcut.Common.Copy} />
				</ActionPanel>
			}
		/>
	);
}
