import assert from "node:assert/strict";

import type { LocalInfo } from "../src/api/local.ts";
import type { PublicInfo } from "../src/api/public.ts";
import type { RateState } from "../src/utils/rates.ts";
import type { TestResult } from "../src/utils/speedtest.ts";
import { summaryText } from "../src/utils/summary.ts";

let checks = 0;
function check(name: string, body: () => void) {
	try {
		body();
		checks++;
		console.log(`ok   ${name}`);
	} catch (error) {
		console.log(`FAIL ${name}`);
		console.log(`     ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

const local: LocalInfo = {
	connected: true,
	primary: {
		iface: "wlp3s0",
		type: "wifi",
		ip: "192.168.1.5",
		prefix: "24",
		netmask: "255.255.255.0",
		ipv6: "fe80::1",
		ipv6Prefix: "64",
		mac: "aa:bb:cc:dd:ee:ff",
		state: "UP",
		isPrimary: true,
		speed: "",
		duplex: "",
	},
	wifi: { ssid: "Home", signalDbm: -45, freqMhz: 5180, rxBitrate: "866 Mbit/s", txBitrate: "780 Mbit/s" },
	gateway: "192.168.1.1",
	gatewayPingMs: 2.4,
	dns: ["1.1.1.1", "8.8.8.8"],
	interfaces: [
		{
			iface: "wlp3s0",
			type: "wifi",
			ip: "192.168.1.5",
			prefix: "24",
			netmask: "255.255.255.0",
			ipv6: "",
			ipv6Prefix: "",
			mac: "aa:bb:cc:dd:ee:ff",
			state: "UP",
			isPrimary: true,
			speed: "",
			duplex: "",
		},
		{
			iface: "tun0",
			type: "vpn",
			ip: "10.8.0.2",
			prefix: "24",
			netmask: "255.255.255.0",
			ipv6: "",
			ipv6Prefix: "",
			mac: "",
			state: "UP",
			isPrimary: false,
			speed: "",
			duplex: "",
		},
	],
	missingTools: [],
};

const publicIp: PublicInfo = {
	ip: "203.0.113.7",
	hostname: "host.example",
	city: "Minsk",
	region: "Minsk",
	country: "BY",
	org: "Example ISP",
	status: "online",
	fetchedAt: 0,
};

const rates: RateState = {
	prev: null,
	prevAt: 0,
	down: 0,
	up: 0,
	smoothDown: 2048,
	smoothUp: 1024,
	peakDown: 4096,
	peakUp: 2048,
	sessionDown: 10 * 1024 * 1024,
	sessionUp: 1024 * 1024,
	ifaceRates: { tun0: { down: 512, up: 256 } },
	history: [],
};

const test: TestResult = {
	downloadMbps: 100,
	uploadMbps: 50,
	pingMs: 3.2,
	jitterMs: null,
	isp: "Example ISP",
	externalIp: "203.0.113.7",
	server: { id: "42", name: "A1", location: "Minsk", country: "BY", distanceKm: null },
	resultUrl: "",
};

check("the block carries every section the view shows", () => {
	const text = summaryText({
		local,
		publicIp,
		apps: [{ name: "firefox", conns: 1, bytesReceived: 2048, bytesSent: 1024, peers: ["1.1.1.1:443"] }],
		rates,
		test,
	});
	for (const part of [
		"Connection",
		"  Interface: wlp3s0 (wifi)",
		"  IPv4: 192.168.1.5/24",
		"  Gateway: 192.168.1.1",
		"  Gateway ping: 2.4 ms",
		"  DNS: 1.1.1.1, 8.8.8.8",
		"  SSID: Home",
		"  Signal: -45 dBm",
		"Public IP",
		"  Organization: Example ISP",
		"  Location: Minsk, Minsk, BY",
		"Throughput",
		"  Peak download: 4.0 KB/s",
		"Interfaces",
		"  tun0 (vpn)",
		"    Download: 0.5 KB/s",
		"Applications",
		"  firefox: 1 connection, ↓ 2.0 KB, ↑ 1.0 KB",
		"    1.1.1.1:443",
		"Speed test",
		"  Download: 100 Mbps",
	]) {
		assert.ok(text.includes(part), `missing ${JSON.stringify(part)} in:\n${text}`);
	}
});

check("the primary interface is not repeated under Interfaces", () => {
	const text = summaryText({ local, publicIp: null, apps: [], rates, test: null });
	assert.ok(!text.includes("  wlp3s0 (wifi)\n    State"), text);
	assert.ok(text.includes("  tun0 (vpn)"), text);
});

check("a disconnected machine still reports what it knows", () => {
	const text = summaryText({ local: { ...local, connected: false, primary: null }, publicIp, apps: [], rates, test: null });
	assert.ok(!text.includes("Connection"), text);
	assert.ok(text.includes("Public IP"), text);
	assert.ok(!text.includes("Speed test"), text);
});

check("a machine with no data shows only the throughput rows", () => {
	assert.equal(
		summaryText({
			local: null,
			publicIp: null,
			apps: [],
			rates: { ...rates, smoothDown: 0, smoothUp: 0, peakDown: 0, peakUp: 0, sessionDown: 0, sessionUp: 0, ifaceRates: {} },
			test: null,
		}),
		"Throughput\n  Download: 0.0 KB/s\n  Upload: 0.0 KB/s\n  Peak download: 0.0 KB/s\n  Peak upload: 0.0 KB/s\n  Session download: 0 B\n  Session upload: 0 B",
	);
});

console.log(`\n${checks} checks passed`);
if (process.exitCode) process.exit(process.exitCode);
