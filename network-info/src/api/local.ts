import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";

import { prefixToNetmask } from "~/utils/format.ts";
import { parseIwLink, parsePingMs, parseResolvectlDns, type WifiLink } from "~/utils/parse.ts";
import { sanitizeText } from "~/utils/text.ts";
import { run } from "./exec.ts";

export type InterfaceType = "ethernet" | "wifi" | "vpn" | "tailscale" | "other";

export interface InterfaceInfo {
	iface: string;
	type: InterfaceType;
	ip: string;
	prefix: string;
	netmask: string;
	ipv6: string;
	ipv6Prefix: string;
	mac: string;
	state: string;
	isPrimary: boolean;
	speed: string;
	duplex: string;
}

export interface LocalInfo {
	connected: boolean;
	primary: InterfaceInfo | null;
	wifi: WifiLink | null;
	gateway: string;
	gatewayPingMs: number | null;
	dns: string[];
	interfaces: InterfaceInfo[];
	missingTools: string[];
}

interface RouteRow {
	dev?: string;
	prefsrc?: string;
	gateway?: string;
}

interface AddrRow {
	family?: string;
	local?: string;
	prefixlen?: number;
	scope?: string;
}

interface LinkRow {
	ifname?: string;
	flags?: string[];
	operstate?: string;
	address?: string;
	addr_info?: AddrRow[];
}

// `ip -j` output is the contract; a shape we cannot read reads as no data.
function rows<T>(stdout: string): T[] {
	try {
		const parsed: unknown = JSON.parse(stdout);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

function validIp(value: unknown): string {
	return typeof value === "string" && isIP(value) ? value : "";
}

async function sysfs(iface: string, name: string): Promise<string> {
	try {
		return sanitizeText((await readFile(`/sys/class/net/${iface}/${name}`, "utf8")).trim(), 16);
	} catch {
		// A wireless interface has these files and reading them fails with
		// EINVAL; a downed ethernet face reports -1. Neither is a link speed.
		return "";
	}
}

function interfaceType(iface: string, flags: string[]): InterfaceType {
	if (existsSync(`/sys/class/net/${iface}/wireless`) || iface.startsWith("wl")) return "wifi";
	if (iface.startsWith("en") || iface.startsWith("eth")) return "ethernet";
	if (iface.includes("tailscale")) return "tailscale";
	if (iface.startsWith("tun") || iface.startsWith("wg") || flags.includes("POINTOPOINT")) return "vpn";
	return "other";
}

export async function readLocalInfo(): Promise<LocalInfo> {
	const info: LocalInfo = {
		connected: false,
		primary: null,
		wifi: null,
		gateway: "",
		gatewayPingMs: null,
		dns: [],
		interfaces: [],
		missingTools: [],
	};

	let route = await run("ip", ["-j", "route", "get", "1.1.1.1"], 2000);
	if (!route.ok) {
		if (route.missing) {
			info.missingTools.push("ip");
			return info;
		}
		route = await run("ip", ["-j", "route", "show", "default"], 2000);
	}
	const first = rows<RouteRow>(route.ok ? route.stdout : "")[0];
	const primaryDev = sanitizeText(first?.dev ?? "", 32);
	const primaryIp = validIp(first?.prefsrc);
	info.gateway = validIp(first?.gateway);
	info.connected = primaryDev !== "";

	const addr = await run("ip", ["-j", "addr", "show"], 2000);
	for (const link of rows<LinkRow>(addr.ok ? addr.stdout : "")) {
		const iface = sanitizeText(link.ifname ?? "", 32);
		if (!iface || iface === "lo") continue;
		const flags = link.flags ?? [];
		const type = interfaceType(iface, flags);

		let ip = "";
		let prefix = "";
		const v6: { ip: string; prefix: string; scope: string }[] = [];
		for (const address of link.addr_info ?? []) {
			const local = validIp(address.local);
			if (!local) continue;
			const len = address.prefixlen === undefined ? "" : String(address.prefixlen);
			if (address.family === "inet" && !ip) {
				ip = local;
				prefix = len;
			} else if (address.family === "inet6") {
				v6.push({ ip: local, prefix: len, scope: address.scope ?? "" });
			}
		}
		const chosen6 = v6.find((a) => a.scope === "global") ?? v6.find((a) => !a.ip.startsWith("fe80"));

		let speed = "";
		let duplex = "";
		if (type === "ethernet" && (iface === primaryDev || link.operstate === "UP")) {
			const raw = await sysfs(iface, "speed");
			if (raw && !raw.startsWith("-")) speed = `${raw} Mbps`;
			duplex = await sysfs(iface, "duplex");
		}

		info.interfaces.push({
			iface,
			type,
			ip,
			prefix,
			netmask: prefixToNetmask(prefix),
			ipv6: chosen6?.ip ?? "",
			ipv6Prefix: chosen6?.prefix ?? "",
			mac: sanitizeText(link.address ?? "", 32),
			state: flags.includes("UP") || link.operstate === "UP" ? "UP" : link.operstate || "DOWN",
			isPrimary: iface === primaryDev,
			speed,
			duplex,
		});
	}

	const primary = info.interfaces.find((i) => i.isPrimary);
	if (primary) {
		if (primaryIp) primary.ip = primaryIp;
		info.primary = primary;
	} else if (primaryDev) {
		info.primary = {
			iface: primaryDev,
			type: "other",
			ip: primaryIp,
			prefix: "",
			netmask: "",
			ipv6: "",
			ipv6Prefix: "",
			mac: "",
			state: "UP",
			isPrimary: true,
			speed: "",
			duplex: "",
		};
	}

	if (info.primary?.type === "wifi") {
		const link = await run("iw", ["dev", info.primary.iface, "link"], 2000);
		info.wifi = link.ok ? parseIwLink(link.stdout) : null;
	}
	if (info.gateway) {
		const ping = await run("ping", ["-c", "1", "-W", "1", info.gateway], 1500);
		info.gatewayPingMs = ping.ok ? parsePingMs(ping.stdout) : null;
	}
	const dns = await run("resolvectl", ["dns"], 1500);
	info.dns = dns.ok ? parseResolvectlDns(dns.stdout) : [];

	return info;
}