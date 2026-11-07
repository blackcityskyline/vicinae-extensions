import { List } from "@vicinae/api";

import type { InterfaceInfo, LocalInfo } from "~/api/local.ts";
import type { PublicInfo } from "~/api/public.ts";
import type { CliInfo } from "~/api/speedtest-cli.ts";
import { formatBytes, formatPing, formatRate } from "~/utils/format.ts";
import type { AppTraffic } from "~/utils/parse.ts";
import type { InterfaceRate, RateState } from "~/utils/rates.ts";
import { sparkline } from "~/utils/sparkline.ts";
import type { TestState } from "~/utils/speedtest.ts";
import { speedtestView } from "~/utils/speedtest-view.ts";

const Metadata = List.Item.Detail.Metadata;

export function ConnectionDetail({ info }: { info: LocalInfo }) {
	const primary = info.primary;
	if (!primary) return null;
	const wifi = info.wifi;
	return (
		<List.Item.Detail
			metadata={
				<Metadata>
					<Metadata.Label title="Interface" text={`${primary.iface} (${primary.type})`} />
					<Metadata.Label title="State" text={primary.state} />
					<Metadata.Label title="IPv4" text={primary.ip ? `${primary.ip}/${primary.prefix}` : "Not assigned"} />
					{primary.netmask ? <Metadata.Label title="Netmask" text={primary.netmask} /> : null}
					{primary.ipv6 ? <Metadata.Label title="IPv6" text={`${primary.ipv6}/${primary.ipv6Prefix}`} /> : null}
					{primary.mac ? <Metadata.Label title="MAC" text={primary.mac} /> : null}
					{primary.speed ? <Metadata.Label title="Link speed" text={primary.speed} /> : null}
					<Metadata.Separator />
					{info.gateway ? <Metadata.Label title="Gateway" text={info.gateway} /> : null}
					{info.gateway ? <Metadata.Label title="Gateway ping" text={formatPing(info.gatewayPingMs)} /> : null}
					{info.dns.length ? <Metadata.Label title="DNS" text={info.dns.join(", ")} /> : null}
					{wifi ? (
						<>
							<Metadata.Separator />
							<Metadata.Label title="SSID" text={wifi.ssid || "Hidden network"} />
							{wifi.signalDbm !== null ? <Metadata.Label title="Signal" text={`${wifi.signalDbm} dBm`} /> : null}
							{wifi.freqMhz !== null ? <Metadata.Label title="Frequency" text={`${wifi.freqMhz} MHz`} /> : null}
							{wifi.rxBitrate ? <Metadata.Label title="RX bitrate" text={wifi.rxBitrate} /> : null}
							{wifi.txBitrate ? <Metadata.Label title="TX bitrate" text={wifi.txBitrate} /> : null}
						</>
					) : null}
				</Metadata>
			}
		/>
	);
}

export function PublicDetail({ info }: { info: PublicInfo }) {
	const location = [info.city, info.region, info.country].filter(Boolean).join(", ");
	const status = info.status === "online" ? "Online" : info.status === "stale" ? "Stale (cached)" : "Offline";
	return (
		<List.Item.Detail
			metadata={
				<Metadata>
					<Metadata.Label title="IP" text={info.ip || "Unknown"} />
					{info.hostname ? <Metadata.Label title="Hostname" text={info.hostname} /> : null}
					{info.org ? <Metadata.Label title="Organization" text={info.org} /> : null}
					{location ? <Metadata.Label title="Location" text={location} /> : null}
					<Metadata.Separator />
					<Metadata.Label title="Status" text={status} />
					{info.fetchedAt ? (
						<Metadata.Label title="Checked" text={new Date(info.fetchedAt).toLocaleTimeString()} />
					) : null}
				</Metadata>
			}
		/>
	);
}

export function ThroughputDetail({
	rates,
	direction,
	showGraph,
	windowSeconds,
}: {
	rates: RateState;
	direction: "down" | "up";
	showGraph: boolean;
	windowSeconds: number;
}) {
	const down = direction === "down";
	const smooth = down ? rates.smoothDown : rates.smoothUp;
	const peak = down ? rates.peakDown : rates.peakUp;
	const session = down ? rates.sessionDown : rates.sessionUp;
	const graph = showGraph ? sparkline(rates.history, direction, windowSeconds, Date.now(), 48) : "";
	return (
		<List.Item.Detail
			markdown={graph ? "```\n" + graph + "\n```" : undefined}
			metadata={
				<Metadata>
					<Metadata.Label title="Current" text={formatRate(smooth)} />
					<Metadata.Label title="Peak" text={formatRate(peak)} />
					<Metadata.Label title="Session" text={formatBytes(session)} />
					{graph ? <Metadata.Label title="Window" text={`${Math.round(windowSeconds / 60)} min`} /> : null}
				</Metadata>
			}
		/>
	);
}

export function InterfaceDetail({ iface, rate }: { iface: InterfaceInfo; rate?: InterfaceRate }) {
	return (
		<List.Item.Detail
			metadata={
				<Metadata>
					<Metadata.Label title="Type" text={iface.type} />
					<Metadata.Label title="State" text={iface.state} />
					<Metadata.Label title="IPv4" text={iface.ip ? `${iface.ip}/${iface.prefix}` : "Not assigned"} />
					{iface.netmask ? <Metadata.Label title="Netmask" text={iface.netmask} /> : null}
					{iface.ipv6 ? <Metadata.Label title="IPv6" text={`${iface.ipv6}/${iface.ipv6Prefix}`} /> : null}
					{iface.mac ? <Metadata.Label title="MAC" text={iface.mac} /> : null}
					{iface.speed ? <Metadata.Label title="Link speed" text={iface.speed} /> : null}
					{iface.duplex ? <Metadata.Label title="Duplex" text={iface.duplex} /> : null}
					{rate ? (
						<>
							<Metadata.Separator />
							<Metadata.Label title="Download" text={formatRate(rate.down)} />
							<Metadata.Label title="Upload" text={formatRate(rate.up)} />
						</>
					) : null}
				</Metadata>
			}
		/>
	);
}

export function SpeedtestDetail({
	state,
	cli,
	error,
	running,
	started,
}: {
	state: TestState;
	cli: CliInfo | null;
	error: string;
	running: boolean;
	started: boolean;
}) {
	const view = speedtestView(state, { running, started, error, kind: cli?.kind ?? null });
	const result = state.result;
	const location = [state.server.location, state.server.country].filter((part) => part !== "").join(", ");
	const showLatency = state.pingMs !== null && (running || result !== null);
	const markdown =
		`# ${view.download}\nDownload\n\n# ${view.upload}\nUpload\n\n${view.status}` +
		(showLatency ? `\n\nLatency · ${formatPing(state.pingMs)}` : "");
	const hasMeta =
		state.pingMs !== null ||
		state.jitterMs !== null ||
		state.isp !== "" ||
		state.server.name !== "" ||
		state.server.id !== "" ||
		state.externalIp !== "" ||
		cli !== null;

	return (
		<List.Item.Detail
			isLoading={running}
			markdown={markdown}
			metadata={
				hasMeta ? (
					<Metadata>
						{state.pingMs !== null ? <Metadata.Label title="Latency" text={formatPing(state.pingMs)} /> : null}
						{state.jitterMs !== null ? <Metadata.Label title="Jitter" text={formatPing(state.jitterMs)} /> : null}
						{state.isp !== "" ? <Metadata.Label title="Provider" text={state.isp} /> : null}
						{state.server.name !== "" ? <Metadata.Label title="Server" text={state.server.name} /> : null}
						{location !== "" ? <Metadata.Label title="Location" text={location} /> : null}
						{state.server.id !== "" ? (
							<Metadata.Label title="Server ID" text={`#${state.server.id}`} />
						) : null}
						{state.externalIp !== "" ? (
							<Metadata.Label title="Public IP" text={state.externalIp} />
						) : null}
						{cli !== null ? (
							<>
								<Metadata.Separator />
								<Metadata.Label title="CLI" text={cli.kind === "ookla" ? "Ookla Speedtest" : "speedtest-cli"} />
							</>
						) : null}
					</Metadata>
				) : undefined
			}
		/>
	);
}

export function AppDetail({ app }: { app: AppTraffic }) {
	return (
		<List.Item.Detail
			markdown={app.peers.length ? `# Peers\n\n${app.peers.map((peer) => `- ${peer}`).join("\n")}` : undefined}
			metadata={
				<Metadata>
					<Metadata.Label title="Connections" text={String(app.conns)} />
					<Metadata.Label title="Received" text={formatBytes(app.bytesReceived)} />
					<Metadata.Label title="Sent" text={formatBytes(app.bytesSent)} />
				</Metadata>
			}
		/>
	);
}