import type { TestResult } from "./parse.ts";

export function formatMbps(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value) || value < 0) return "—";
	if (value < 10) return `${value.toFixed(1)} Mbps`;
	return `${Math.round(value)} Mbps`;
}

export function formatPing(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value) || value < 0) return "—";
	if (value < 10) return `${value.toFixed(1)} ms`;
	return `${Math.round(value)} ms`;
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
