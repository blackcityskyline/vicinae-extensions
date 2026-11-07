import type { TestResult } from "./speedtest.ts";
// A value that would round to 1024 is shown in the next unit instead, so the
// reader never sees "1024 KB". Upstream's PROMOTE_AT.
const PROMOTE_AT = 1023.5;

export function formatBytes(bytes: number): string {
	const b = Math.max(0, Number(bytes) || 0);
	if (b < 1024) return `${Math.round(b)} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = b / 1024;
	let unit = 0;
	while (value >= PROMOTE_AT && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function rateParts(bps: number): { num: string; unit: string } {
	let value = Math.max(0, Number(bps) || 0) / 1024;
	let unit = "K";
	if (value >= PROMOTE_AT) {
		value /= 1024;
		unit = "M";
	}
	if (value >= PROMOTE_AT) {
		value /= 1024;
		unit = "G";
	}
	return { num: value < 10 ? value.toFixed(1) : String(Math.round(value)), unit };
}

export function formatRate(bps: number): string {
	const { num, unit } = rateParts(bps);
	return `${num} ${unit}B/s`;
}

export function formatRateCompact(bps: number): string {
	const { num, unit } = rateParts(bps);
	return num + unit;
}

export function formatPing(ms: number | null | undefined): string {
	if (ms === undefined || ms === null || Number.isNaN(ms) || ms < 0) return "—";
	if (ms < 1) return "<1 ms";
	if (ms < 10) return `${ms.toFixed(1)} ms`;
	return `${Math.round(ms)} ms`;
}

export function prefixToNetmask(prefix: number | string): string {
	if (prefix === "") return "";
	const bits = Number(prefix);
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return "";
	const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
	return [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join(".");
}

export function formatMbps(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value) || value < 0) return "—";
	if (value < 10) return `${value.toFixed(1)} Mbps`;
	return `${Math.round(value)} Mbps`;
}

export function resultText(result: TestResult): string {
	const lines: string[] = [];
	lines.push(`Download: ${formatMbps(result.downloadMbps)}`);
	lines.push(`Upload: ${formatMbps(result.uploadMbps)}`);
	lines.push(`Ping: ${formatPing(result.pingMs)}`);
	if (result.jitterMs !== null) lines.push(`Jitter: ${formatPing(result.jitterMs)}`);
	if (result.isp !== "") lines.push(`Provider: ${result.isp}`);
	const serverParts = [result.server.name, result.server.location, result.server.country].filter(
		(part) => part !== "",
	);
	const serverDesc = serverParts.join(", ") + (result.server.id !== "" ? ` (#${result.server.id})` : "");
	lines.push(`Server: ${serverDesc}`);
	if (result.externalIp !== "") lines.push(`Public IP: ${result.externalIp}`);
	if (result.resultUrl !== "") lines.push(`Result: ${result.resultUrl}`);
	return lines.join("\n");
}
