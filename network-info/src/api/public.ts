import { isIP } from "node:net";

import { sanitizeText } from "~/utils/text.ts";

export interface PublicInfo {
	ip: string;
	hostname: string;
	city: string;
	region: string;
	country: string;
	org: string;
	status: "online" | "offline" | "stale";
	fetchedAt: number;
}

const MAX_BYTES = 16384;
const ENDPOINT_TIMEOUT_MS = 3000;
const DEADLINE_MS = 6000;
const HEADERS = { "User-Agent": "VicinaeNetworkInfo/1.0", Accept: "application/json" };

function validIp(value: unknown): string {
	return typeof value === "string" && isIP(value) ? value : "";
}

async function fetchBody(url: string, deadline: number): Promise<string> {
	const remaining = deadline - Date.now();
	if (remaining <= 50) throw new Error("public IP deadline exceeded");
	const response = await fetch(url, {
		headers: HEADERS,
		redirect: "error",
		signal: AbortSignal.timeout(Math.min(ENDPOINT_TIMEOUT_MS, remaining)),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
		throw new Error("public IP response too large");
	}
	const reader = response.body?.getReader();
	if (!reader) throw new Error("public IP response has no body");
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BYTES) {
			await reader.cancel();
			throw new Error("public IP response too large");
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString("utf8");
}

// Each endpoint is the fallback for the one before it, so a failure here is
// not an error yet; the last one failing is what "offline" means.
async function attempt<T>(
	url: string,
	deadline: number,
	read: (body: string) => T | null,
): Promise<T | null> {
	try {
		return read(await fetchBody(url, deadline));
	} catch {
		return null;
	}
}

export async function fetchPublicIp(): Promise<PublicInfo> {
	const offline: PublicInfo = {
		ip: "",
		hostname: "",
		city: "",
		region: "",
		country: "",
		org: "",
		status: "offline",
		fetchedAt: Date.now(),
	};
	const deadline = Date.now() + DEADLINE_MS;

	const full = await attempt("https://ipinfo.io/json", deadline, (body) => {
		const data = JSON.parse(body) as Record<string, unknown>;
		const ip = validIp(data.ip);
		if (!ip) return null;
		return {
			ip,
			hostname: sanitizeText(data.hostname, 128),
			city: sanitizeText(data.city, 64),
			region: sanitizeText(data.region, 64),
			country: sanitizeText(data.country, 64),
			org: sanitizeText(data.org, 128),
			status: "online" as const,
			fetchedAt: Date.now(),
		};
	});
	if (full) return full;

	const ipify = await attempt("https://api.ipify.org?format=json", deadline, (body) =>
		validIp((JSON.parse(body) as Record<string, unknown>).ip),
	);
	if (ipify) return { ...offline, ip: ipify, status: "online", fetchedAt: Date.now() };

	const plain = await attempt("https://icanhazip.com", deadline, (body) => validIp(body.trim()));
	if (plain) return { ...offline, ip: plain, status: "online", fetchedAt: Date.now() };

	return offline;
}