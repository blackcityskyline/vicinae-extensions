import type { InterfaceInfo, LocalInfo } from "../api/local.ts";
import type { PublicInfo } from "../api/public.ts";
import { formatBytes, formatPing, formatRate, resultText } from "./format.ts";
import type { AppTraffic } from "./parse.ts";
import type { RateState } from "./rates.ts";
import type { TestResult } from "./speedtest.ts";

export interface SummaryInput {
	local: LocalInfo | null;
	publicIp: PublicInfo | null;
	apps: AppTraffic[];
	rates: RateState;
	test: TestResult | null;
}

function field(label: string, value: string | number | null | undefined, indent = "  "): string | null {
	const text = value === null || value === undefined ? "" : String(value).trim();
	return text === "" ? null : `${indent}${label}: ${text}`;
}

function keep(lines: (string | null)[]): string[] {
	return lines.filter((line): line is string => line !== null);
}

function interfaceFields(iface: InterfaceInfo, indent: string): string[] {
	return keep([
		field("State", iface.state, indent),
		field("IPv4", iface.ip ? `${iface.ip}/${iface.prefix}` : "Not assigned", indent),
		field("Netmask", iface.netmask, indent),
		field("IPv6", iface.ipv6 ? `${iface.ipv6}/${iface.ipv6Prefix}` : "", indent),
		field("MAC", iface.mac, indent),
		field("Link speed", iface.speed, indent),
		field("Duplex", iface.duplex, indent),
	]);
}

const STATUS: Record<PublicInfo["status"], string> = {
	online: "Online",
	stale: "Stale (cached)",
	offline: "Offline",
};

/** Everything the view shows, as one text block for the clipboard. */
export function summaryText({ local, publicIp, apps, rates, test }: SummaryInput): string {
	const out: string[] = [];
	const section = (title: string, lines: string[]) => {
		if (!lines.length) return;
		if (out.length) out.push("");
		out.push(title, ...lines);
	};

	const primary = local?.primary ?? null;
	if (local?.connected && primary) {
		const wifi = local.wifi;
		section("Connection", [
			...keep([field("Interface", `${primary.iface} (${primary.type})`)]),
			...interfaceFields(primary, "  "),
			...keep([
				field("Gateway", local.gateway),
				local.gateway ? field("Gateway ping", formatPing(local.gatewayPingMs)) : null,
				field("DNS", local.dns.join(", ")),
			]),
			...keep([
				wifi ? field("SSID", wifi.ssid || "Hidden network") : null,
				wifi && wifi.signalDbm !== null ? field("Signal", `${wifi.signalDbm} dBm`) : null,
				wifi && wifi.freqMhz !== null ? field("Frequency", `${wifi.freqMhz} MHz`) : null,
				wifi ? field("RX bitrate", wifi.rxBitrate) : null,
				wifi ? field("TX bitrate", wifi.txBitrate) : null,
			]),
		]);
	}

	if (publicIp) {
		section("Public IP", keep([
			field("IP", publicIp.ip || "Unknown"),
			field("Hostname", publicIp.hostname),
			field("Organization", publicIp.org),
			field("Location", [publicIp.city, publicIp.region, publicIp.country].filter(Boolean).join(", ")),
			field("Status", STATUS[publicIp.status]),
		]));
	}

	section("Throughput", [
		...keep([
			field("Download", formatRate(rates.smoothDown)),
			field("Upload", formatRate(rates.smoothUp)),
			field("Peak download", formatRate(rates.peakDown)),
			field("Peak upload", formatRate(rates.peakUp)),
			field("Session download", formatBytes(rates.sessionDown)),
			field("Session upload", formatBytes(rates.sessionUp)),
		]),
	]);

	const others = (local?.interfaces ?? []).filter(
		(iface) => !iface.isPrimary && iface.ip && iface.state === "UP",
	);
	if (others.length) {
		out.push("", "Interfaces");
		for (const iface of others) {
			const rate = rates.ifaceRates[iface.iface];
			out.push(`  ${iface.iface} (${iface.type})`, ...interfaceFields(iface, "    "));
			if (rate) {
				out.push(...keep([field("Download", formatRate(rate.down), "    "), field("Upload", formatRate(rate.up), "    ")]));
			}
		}
	}

	if (apps.length) {
		out.push("", "Applications");
		for (const app of apps) {
			out.push(
				`  ${app.name}: ${app.conns} connection${app.conns === 1 ? "" : "s"}, ↓ ${formatBytes(app.bytesReceived)}, ↑ ${formatBytes(app.bytesSent)}`,
			);
			for (const peer of app.peers) out.push(`    ${peer}`);
		}
	}

	if (test) {
		out.push("", "Speed test");
		for (const line of resultText(test).split("\n")) out.push(`  ${line}`);
	}

	return out.join("\n");
}
