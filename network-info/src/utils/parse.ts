import { isIP } from "node:net";

import { sanitizeText } from "./text.ts";

interface InterfaceCounters {
	rx: number;
	tx: number;
}

export interface DevSample {
	rx: number;
	tx: number;
	iface: string;
	interfaces: Record<string, InterfaceCounters>;
}

export interface AppTraffic {
	name: string;
	conns: number;
	bytesSent: number;
	bytesReceived: number;
	peers: string[];
}

export interface WifiLink {
	ssid: string;
	signalDbm: number | null;
	freqMhz: number | null;
	rxBitrate: string;
	txBitrate: string;
}

const VIRTUAL_IFACE = /^(lo|docker\d*|br-|veth|virbr|tun|tap|wg|tailscale|cni|flannel|cali|cilium|lxc|dummy)/i;

export function parseProcNetDev(
	text: string,
	scope: "primary" | "all",
	primaryIface: string,
): DevSample | null {
	if (!text) return null;
	const lines = text.split("\n");
	const interfaces: Record<string, InterfaceCounters> = {};
	let sumRx = 0;
	let sumTx = 0;
	let sumCount = 0;

	// The first two lines are the column header; net/core/net-procfs.c then
	// prints eight receive counters and eight transmit counters per face.
	for (let i = 2; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (!line) continue;
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const iface = line.slice(0, colon).trim();
		if (!iface || iface === "lo") continue;
		const fields = line.slice(colon + 1).trim().split(/\s+/);
		if (fields.length < 9) continue;
		const rx = Number.parseInt(fields[0] ?? "", 10);
		const tx = Number.parseInt(fields[8] ?? "", 10);
		if (Number.isNaN(rx) || Number.isNaN(tx)) continue;
		interfaces[iface] = { rx, tx };
		if (!VIRTUAL_IFACE.test(iface)) {
			sumRx += rx;
			sumTx += tx;
			sumCount++;
		}
	}

	const primary = primaryIface ? interfaces[primaryIface] : undefined;
	if (scope === "primary" && primary) {
		return { rx: primary.rx, tx: primary.tx, iface: primaryIface, interfaces };
	}
	if (sumCount === 0 && primary) {
		return { rx: primary.rx, tx: primary.tx, iface: primaryIface, interfaces };
	}
	if (sumCount === 0 && Object.keys(interfaces).length === 0) return null;
	return {
		rx: sumRx,
		tx: sumTx,
		iface: scope === "primary" ? primaryIface : "all",
		interfaces,
	};
}

function peerHost(peer: string): string {
	const bracket = peer.lastIndexOf("]:");
	if (bracket >= 0) return peer.slice(1, bracket);
	const colon = peer.lastIndexOf(":");
	return colon > 0 ? peer.slice(0, colon) : peer;
}

function isLoopback(host: string): boolean {
	// An IPv4-mapped address is the same loopback socket in another spelling;
	// upstream matched only the two unmapped ones and counted it as traffic.
	const bare = host.replace(/^::ffff:/i, "");
	return bare === "::1" || bare.startsWith("127.");
}

function tcpCounter(line: string, key: string): number {
	const match = new RegExp(`\\b${key}:(\\d+)`).exec(line);
	return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

export function parseSockets(text: string): AppTraffic[] {
	if (!text) return [];
	const byApp = new Map<string, AppTraffic>();
	let current: AppTraffic | undefined;

	for (const raw of text.split("\n")) {
		if (!raw) continue;
		if (/^\s/.test(raw)) {
			// The indented line is the TCP-info block of the socket above it.
			if (current) {
				current.bytesSent += tcpCounter(raw, "bytes_sent");
				current.bytesReceived += tcpCounter(raw, "bytes_received");
			}
			continue;
		}
		current = undefined;
		// `ss -tinp state established` prints no State column: receive queue,
		// send queue, local, peer, owner.
		const parts = raw.trim().split(/\s+/);
		if (parts.length < 5) continue;
		const owner = /users:\(\("([^"]+)"/.exec(raw);
		if (!owner) continue;
		const name = sanitizeText(owner[1], 48);
		if (!name) continue;
		const host = peerHost(parts[3] ?? "");
		if (isLoopback(host)) continue;

		let entry = byApp.get(name);
		if (!entry) {
			entry = { name, conns: 0, bytesSent: 0, bytesReceived: 0, peers: [] };
			byApp.set(name, entry);
		}
		entry.conns++;
		if (!entry.peers.includes(host) && entry.peers.length < 3) entry.peers.push(host);
		current = entry;
	}

	return [...byApp.values()].sort((a, b) => {
		const moved = b.bytesSent + b.bytesReceived - (a.bytesSent + a.bytesReceived);
		if (moved !== 0) return moved;
		if (b.conns !== a.conns) return b.conns - a.conns;
		return a.name.localeCompare(b.name);
	});
}

export function parseIwLink(text: string): WifiLink | null {
	if (!text || !/^Connected to /m.test(text)) return null;
	const field = (key: string): string => {
		const match = new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, "m").exec(text);
		return sanitizeText(match?.[1]?.trim() ?? "");
	};
	const signal = Number.parseInt(field("signal"), 10);
	const freq = Number.parseFloat(field("freq"));
	return {
		ssid: field("SSID"),
		signalDbm: Number.isNaN(signal) ? null : signal,
		freqMhz: Number.isNaN(freq) ? null : freq,
		rxBitrate: field("rx bitrate"),
		txBitrate: field("tx bitrate"),
	};
}

export function parseResolvectlDns(text: string): string[] {
	const servers = new Set<string>();
	for (const line of text.split("\n")) {
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		for (const token of line.slice(colon + 1).trim().split(/\s+/)) {
			if (!token) continue;
			const address = (token.split("%")[0] ?? "").split("#")[0] ?? "";
			if (!isIP(address)) continue;
			if (address.startsWith("fd") || address.startsWith("fe80")) continue;
			servers.add(address);
		}
	}
	return [...servers].sort();
}

export function parsePingMs(text: string): number | null {
	const match = /time[=<]([0-9.]+)/.exec(text);
	if (!match) return null;
	const ms = Number.parseFloat(match[1] ?? "");
	return Number.isNaN(ms) ? null : ms;
}