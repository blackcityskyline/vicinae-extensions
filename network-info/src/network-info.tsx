import { Action, ActionPanel, getPreferenceValues, Icon, Keyboard, List } from "@vicinae/api";

import { CopyAction } from "~/components/actions.tsx";
import {
	AppDetail,
	ConnectionDetail,
	InterfaceDetail,
	PublicDetail,
	SpeedtestDetail,
	ThroughputDetail,
} from "~/components/details.tsx";
import { useNetwork } from "~/hooks/use-network.ts";
import { useSpeedtest } from "~/hooks/use-speedtest.ts";
import { formatBytes, formatPing, formatRate, formatRateCompact, resultText } from "~/utils/format.ts";
import { speedtestView } from "~/utils/speedtest-view.ts";

function RefreshAction({ refresh }: { refresh: (force?: boolean) => void }) {
	return (
		<Action
			title="Refresh"
			icon={Icon.ArrowClockwise}
			shortcut={Keyboard.Shortcut.Common.Refresh}
			onAction={() => refresh(true)}
		/>
	);
}

export default function Command() {
	const { local, publicIp, apps, rates, loading, refresh } = useNetwork();
	const speedtest = useSpeedtest();
	const prefs = getPreferenceValues<Preferences>();
	const showGraph = prefs.showGraph ?? true;
	const showPerApp = prefs.showPerApp ?? true;
	const windowSeconds = Number(prefs.chartWindow ?? "300") || 300;

	if (local?.missingTools.includes("ip")) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="iproute2 is not installed"
					description="The ip command is required to read the network state. Install the iproute2 package."
				/>
			</List>
		);
	}
	if (local && !local.connected) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.WifiDisabled}
					title="No network connection"
					description="No default route was found."
					actions={
						<ActionPanel>
							<RefreshAction refresh={refresh} />
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	const primary = local?.primary ?? null;
	const others = (local?.interfaces ?? []).filter((iface) => !iface.isPrimary && iface.ip && iface.state === "UP");
	const publicTitle = !publicIp ? "Fetching…" : publicIp.status === "offline" ? "Offline" : publicIp.ip;
	const publicSubtitle = !publicIp
		? "Asking the public IP endpoints"
		: publicIp.status === "offline"
			? "No endpoint answered"
			: (publicIp.status === "stale" ? "Stale · " : "") +
				[publicIp.org, publicIp.city, publicIp.country].filter(Boolean).join(" · ");
	const test = speedtest.state.result;
	const speedView = speedtestView(speedtest.state, {
		running: speedtest.running,
		started: speedtest.started,
		error: speedtest.error,
		kind: speedtest.cli?.kind ?? null,
	});

	return (
		<List isShowingDetail isLoading={loading} searchBarPlaceholder="Search addresses, interfaces, apps…">
			<List.Section title="Speed test">
				<List.Item
					id="speedtest"
					title="Speedtest"
					subtitle={speedView.subtitle}
					icon={Icon.Gauge}
					keywords={["speed", "bandwidth", "ping", "latency", "jitter"]}
					detail={
						<SpeedtestDetail
							state={speedtest.state}
							cli={speedtest.cli}
							error={speedtest.error}
							running={speedtest.running}
							started={speedtest.started}
						/>
					}
					actions={
						<ActionPanel>
							{speedtest.running ? (
								<Action title="Stop Test" icon={Icon.Stop} onAction={speedtest.stop} />
							) : (
								<Action title="Start Test" icon={Icon.Play} onAction={speedtest.start} />
							)}
							{test ? (
								<CopyAction
									title="Copy Results"
									content={resultText(test)}
									shortcut={Keyboard.Shortcut.Common.Copy}
								/>
							) : null}
							{test?.resultUrl ? <Action.OpenInBrowser title="Open Result" url={test.resultUrl} /> : null}
						</ActionPanel>
					}
				/>
			</List.Section>
			{local && local.connected && primary ? (
				<List.Section title="Connection">
					<List.Item
						id="ipv4"
						title={primary.ip || "No IPv4 address"}
						subtitle={`${primary.iface} · ${primary.type}`}
						icon={primary.type === "wifi" ? Icon.Wifi : Icon.Network}
						keywords={[primary.iface, "ipv4", "address"]}
						detail={<ConnectionDetail info={local} />}
						actions={
							<ActionPanel>
								{primary.ip ? (
									<CopyAction title="Copy IP Address" content={primary.ip} shortcut={Keyboard.Shortcut.Common.Copy} />
								) : null}
								{primary.ip && primary.prefix ? (
									<CopyAction title="Copy CIDR" content={`${primary.ip}/${primary.prefix}`} />
								) : null}
								<RefreshAction refresh={refresh} />
							</ActionPanel>
						}
					/>
					{primary.ipv6 ? (
						<List.Item
							id="ipv6"
							title={primary.ipv6}
							subtitle="IPv6"
							icon={Icon.Network}
							detail={<ConnectionDetail info={local} />}
							actions={
								<ActionPanel>
									<CopyAction title="Copy IPv6 Address" content={primary.ipv6} shortcut={Keyboard.Shortcut.Common.Copy} />
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					) : null}
					{primary.mac ? (
						<List.Item
							id="mac"
							title={primary.mac}
							subtitle="MAC address"
							icon={Icon.ComputerChip}
							detail={<ConnectionDetail info={local} />}
							actions={
								<ActionPanel>
									<CopyAction title="Copy MAC Address" content={primary.mac} shortcut={Keyboard.Shortcut.Common.Copy} />
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					) : null}
					{local.gateway ? (
						<List.Item
							id="gateway"
							title={local.gateway}
							subtitle={`Gateway · ${formatPing(local.gatewayPingMs)}`}
							icon={Icon.Link}
							detail={<ConnectionDetail info={local} />}
							actions={
								<ActionPanel>
									<CopyAction title="Copy Gateway" content={local.gateway} shortcut={Keyboard.Shortcut.Common.Copy} />
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					) : null}
					{local.dns.map((server) => (
						<List.Item
							key={server}
							id={`dns-${server}`}
							title={server}
							subtitle="DNS server"
							icon={Icon.Globe01}
							detail={<ConnectionDetail info={local} />}
							actions={
								<ActionPanel>
									<CopyAction title="Copy DNS Server" content={server} shortcut={Keyboard.Shortcut.Common.Copy} />
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					))}
					{local.wifi ? (
						<List.Item
							id="wifi"
							title={local.wifi.ssid || "Hidden network"}
							subtitle={[
								local.wifi.signalDbm !== null ? `${local.wifi.signalDbm} dBm` : "",
								local.wifi.freqMhz !== null ? `${local.wifi.freqMhz} MHz` : "",
							]
								.filter(Boolean)
								.join(" · ")}
							icon={Icon.Wifi}
							keywords={["ssid", "signal", "wireless"]}
							detail={<ConnectionDetail info={local} />}
							actions={
								<ActionPanel>
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					) : null}
				</List.Section>
			) : null}
			<List.Section title="Public IP">
				<List.Item
					id="public"
					title={publicTitle}
					subtitle={publicSubtitle}
					icon={Icon.Globe01}
					keywords={["public", "external", "wan"]}
					detail={publicIp ? <PublicDetail info={publicIp} /> : undefined}
					actions={
						<ActionPanel>
							{publicIp && publicIp.ip && publicIp.status !== "offline" ? (
								<CopyAction title="Copy Public IP" content={publicIp.ip} shortcut={Keyboard.Shortcut.Common.Copy} />
							) : null}
							<Action
								title="Look Up Again"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={() => refresh(true)}
							/>
						</ActionPanel>
					}
				/>
			</List.Section>
			<List.Section title="Throughput">
				<List.Item
					id="down"
					title={formatRate(rates.smoothDown)}
					subtitle={`Peak ${formatRate(rates.peakDown)} · Session ${formatBytes(rates.sessionDown)}`}
					icon={Icon.Download}
					keywords={["download", "rx", "receive"]}
					detail={
						<ThroughputDetail rates={rates} direction="down" showGraph={showGraph} windowSeconds={windowSeconds} />
					}
					actions={
						<ActionPanel>
							<RefreshAction refresh={refresh} />
						</ActionPanel>
					}
				/>
				<List.Item
					id="up"
					title={formatRate(rates.smoothUp)}
					subtitle={`Peak ${formatRate(rates.peakUp)} · Session ${formatBytes(rates.sessionUp)}`}
					icon={Icon.Upload}
					keywords={["upload", "tx", "send"]}
					detail={
						<ThroughputDetail rates={rates} direction="up" showGraph={showGraph} windowSeconds={windowSeconds} />
					}
					actions={
						<ActionPanel>
							<RefreshAction refresh={refresh} />
						</ActionPanel>
					}
				/>
			</List.Section>
			{others.length ? (
				<List.Section title="Interfaces">
					{others.map((iface) => {
						const rate = rates.ifaceRates[iface.iface];
						return (
							<List.Item
								key={iface.iface}
								id={`iface-${iface.iface}`}
								title={iface.iface}
								subtitle={`${iface.ip} · ${iface.type}`}
								icon={iface.type === "wifi" ? Icon.Wifi : Icon.Network}
								keywords={[iface.ip, iface.type]}
								accessories={
									rate ? [{ text: `↓ ${formatRateCompact(rate.down)} ↑ ${formatRateCompact(rate.up)}` }] : undefined
								}
								detail={<InterfaceDetail iface={iface} rate={rate} />}
								actions={
									<ActionPanel>
										<CopyAction title="Copy IP Address" content={iface.ip} shortcut={Keyboard.Shortcut.Common.Copy} />
										<RefreshAction refresh={refresh} />
									</ActionPanel>
								}
							/>
						);
					})}
				</List.Section>
			) : null}
			{showPerApp ? (
				<List.Section title="Applications">
					{apps.length ? (
						apps.map((app) => (
							<List.Item
								key={app.name}
								id={`app-${app.name}`}
								title={app.name}
								subtitle={`${app.conns} connection${app.conns === 1 ? "" : "s"}`}
								icon={Icon.AppWindow}
								keywords={app.peers}
								accessories={[
									{ text: `↓ ${formatBytes(app.bytesReceived)}` },
									{ text: `↑ ${formatBytes(app.bytesSent)}` },
								]}
								detail={<AppDetail app={app} />}
								actions={
									<ActionPanel>
										{app.peers.length ? <CopyAction title="Copy Peers" content={app.peers.join("\n")} /> : null}
										<RefreshAction refresh={refresh} />
									</ActionPanel>
								}
							/>
						))
					) : (
						<List.Item
							id="apps-empty"
							title="No app traffic"
							subtitle="No established connections with an owning process"
							icon={Icon.Warning}
							actions={
								<ActionPanel>
									<RefreshAction refresh={refresh} />
								</ActionPanel>
							}
						/>
					)}
				</List.Section>
			) : null}

		</List>
	);
}