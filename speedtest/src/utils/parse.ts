export type Backend = "ookla" | "python";
export type Phase =
	| "prepare"
	| "ping"
	| "download"
	| "upload"
	| "complete"
	| "failed";

export interface ServerInfo {
	id: string;
	name: string;
	location: string;
	country: string;
}

export interface TestResult {
	downloadMbps: number;
	uploadMbps: number;
	pingMs: number | null;
	jitterMs: number | null;
	isp: string;
	externalIp: string;
	server: ServerInfo;
	resultUrl: string;
}

export interface TestState {
	phase: Phase;
	downloadMbps: number;
	uploadMbps: number;
	pingMs: number | null;
	jitterMs: number | null;
	isp: string;
	externalIp: string;
	server: ServerInfo;
	resultUrl: string;
	error: string;
	result: TestResult | null;
}

const EMPTY_SERVER: ServerInfo = { id: "", name: "", location: "", country: "" };

export function initialState(): TestState {
	return {
		phase: "prepare",
		downloadMbps: 0,
		uploadMbps: 0,
		pingMs: null,
		jitterMs: null,
		isp: "",
		externalIp: "",
		server: { ...EMPTY_SERVER },
		resultUrl: "",
		error: "",
		result: null,
	};
}

export function bandwidthToMbps(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	return (value * 8) / 1_000_000;
}

function sanitize(value: unknown): string {
	if (typeof value !== "string") return "";
	return value.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 256);
}

function mergeServerField(target: ServerInfo, key: keyof ServerInfo, raw: unknown): void {
	if (raw === undefined || raw === null) return;
	if (typeof raw === "string") {
		const s = sanitize(raw);
		if (s !== "") target[key] = s;
		return;
	}
	if (typeof raw === "number" || typeof raw === "boolean") {
		target[key] = String(raw);
	}
}

export function applyEvent(state: TestState, event: unknown): TestState {
	if (typeof event !== "object" || event === null) return state;
	const e = event as Record<string, unknown>;

	if (state.result !== null && e.type !== "result") return state;

	const next: TestState = {
		...state,
		server: { ...state.server },
	};

	if (typeof e.isp === "string") {
		const s = sanitize(e.isp);
		if (s !== "") next.isp = s;
	}

	const serverRaw = e.server;
	if (typeof serverRaw === "object" && serverRaw !== null) {
		const s = serverRaw as Record<string, unknown>;
		const merged: ServerInfo = { ...next.server };
		mergeServerField(merged, "id", s.id);
		mergeServerField(merged, "name", s.name);
		mergeServerField(merged, "location", s.location);
		mergeServerField(merged, "country", s.country);
		next.server = merged;
	}

	const ifaceRaw = e.interface;
	if (typeof ifaceRaw === "object" && ifaceRaw !== null) {
		const ip = (ifaceRaw as Record<string, unknown>).externalIp;
		if (typeof ip === "string") {
			const s = sanitize(ip);
			if (s !== "") next.externalIp = s;
		}
	}

	const type = e.type;

	if (type === "ping") {
		const pingRaw = e.ping;
		if (typeof pingRaw === "object" && pingRaw !== null) {
			const p = pingRaw as Record<string, unknown>;
			if (typeof p.latency === "number" && Number.isFinite(p.latency) && p.latency >= 0) {
				next.pingMs = p.latency;
			}
			if (typeof p.jitter === "number" && Number.isFinite(p.jitter) && p.jitter >= 0) {
				next.jitterMs = p.jitter;
			}
		}
		next.phase = "ping";
	}

	if (type === "download" || type === "upload") {
		const dataRaw = e[type];
		const data = typeof dataRaw === "object" && dataRaw !== null ? (dataRaw as Record<string, unknown>) : {};
		const rate = bandwidthToMbps(data.bandwidth);
		if (rate !== null) {
			next.phase = type;
			if (type === "download") next.downloadMbps = rate;
			else next.uploadMbps = rate;
		}
	}

	if (type === "result") {
		const down = bandwidthToMbps((e.download as Record<string, unknown> | null)?.bandwidth);
		const up = bandwidthToMbps((e.upload as Record<string, unknown> | null)?.bandwidth);
		if (down === null || up === null) {
			next.error = "Speedtest returned an incomplete result.";
			next.phase = "failed";
		} else {
			next.downloadMbps = down;
			next.uploadMbps = up;
			next.phase = "complete";

			const pingRaw = e.ping;
			if (typeof pingRaw === "object" && pingRaw !== null) {
				const p = pingRaw as Record<string, unknown>;
				if (typeof p.latency === "number" && Number.isFinite(p.latency) && p.latency >= 0) {
					next.pingMs = p.latency;
				}
				if (typeof p.jitter === "number" && Number.isFinite(p.jitter) && p.jitter >= 0) {
					next.jitterMs = p.jitter;
				}
			}

			let resultUrl = next.resultUrl;
			const resultRaw = e.result;
			if (typeof resultRaw === "object" && resultRaw !== null) {
				const url = (resultRaw as Record<string, unknown>).url;
				if (typeof url === "string") resultUrl = sanitize(url);
			}
			next.resultUrl = resultUrl;

			const snapshot: TestResult = {
				downloadMbps: down,
				uploadMbps: up,
				pingMs: next.pingMs,
				jitterMs: next.jitterMs,
				isp: next.isp,
				externalIp: next.externalIp,
				server: { ...next.server },
				resultUrl,
			};
			next.result = snapshot;
		}
	}

	if (typeof e.error === "string" && e.error.trim() !== "") {
		next.error = sanitize(e.error);
	}
	if (type === "log" && typeof e.level === "string" && e.level === "error") {
		const msg =
			typeof e.message === "string" ? e.message : typeof e.error === "string" ? e.error : "";
		if (msg.trim() !== "") next.error = sanitize(msg);
	}

	return next;
}

export function fromPython(value: unknown): TestState {
	const base = initialState();
	if (typeof value !== "object" || value === null) {
		return { ...base, phase: "failed", error: "speedtest-cli returned an incomplete result." };
	}
	const v = value as Record<string, unknown>;

	const downloadRaw = v.download;
	const uploadRaw = v.upload;
	if (
		typeof downloadRaw !== "number" ||
		!Number.isFinite(downloadRaw) ||
		downloadRaw < 0 ||
		typeof uploadRaw !== "number" ||
		!Number.isFinite(uploadRaw) ||
		uploadRaw < 0
	) {
		return { ...base, phase: "failed", error: "speedtest-cli returned an incomplete result." };
	}

	const downloadMbps = downloadRaw / 1_000_000;
	const uploadMbps = uploadRaw / 1_000_000;

	const pingRaw = v.ping;
	const pingMs = typeof pingRaw === "number" && Number.isFinite(pingRaw) && pingRaw >= 0 ? pingRaw : null;

	let isp = "";
	let externalIp = "";
	const clientRaw = v.client;
	if (typeof clientRaw === "object" && clientRaw !== null) {
		const c = clientRaw as Record<string, unknown>;
		if (typeof c.isp === "string") isp = sanitize(c.isp);
		if (typeof c.ip === "string") externalIp = sanitize(c.ip);
	}

	const server: ServerInfo = { id: "", name: "", location: "", country: "" };
	const serverRaw = v.server;
	if (typeof serverRaw === "object" && serverRaw !== null) {
		const s = serverRaw as Record<string, unknown>;
		if (s.id !== undefined && s.id !== null) server.id = sanitize(String(s.id));
		if (typeof s.sponsor === "string") server.name = sanitize(s.sponsor);
		else if (s.sponsor !== undefined && s.sponsor !== null) server.name = sanitize(String(s.sponsor));
		if (typeof s.name === "string") server.location = sanitize(s.name);
		else if (s.name !== undefined && s.name !== null) server.location = sanitize(String(s.name));
		if (typeof s.country === "string") server.country = sanitize(s.country);
		else if (s.country !== undefined && s.country !== null) server.country = sanitize(String(s.country));
	}

	const resultUrl = typeof v.share === "string" ? sanitize(v.share) : "";

	const result: TestResult = {
		downloadMbps,
		uploadMbps,
		pingMs,
		jitterMs: null,
		isp,
		externalIp,
		server: { ...server },
		resultUrl,
	};

	return {
		phase: "complete",
		downloadMbps,
		uploadMbps,
		pingMs,
		jitterMs: null,
		isp,
		externalIp,
		server,
		resultUrl,
		error: "",
		result,
	};
}

export function takeLines(buffer: string): { lines: string[]; rest: string } {
	const idx = buffer.lastIndexOf("\n");
	if (idx === -1) return { lines: [], rest: buffer };
	const complete = buffer.slice(0, idx).split("\n");
	const rest = buffer.slice(idx + 1);
	const lines = complete.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
	return { lines, rest };
}
