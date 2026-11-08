import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
	buildTunConfig,
	parseCoreVersion,
	parseModeFromCmdline,
	parseRouteMode,
	readRouting,
	setRouting as applyRouting,
	type Mode,
	type RouteMode,
	type Routing,
} from "~/utils/config.ts";

const MIHOMO = "/usr/bin/mihomo";
const CONFIG_DIR = join(homedir(), ".config/mihomo");
const CONFIG_PROXY = join(CONFIG_DIR, "config.yaml");
const CONFIG_TUN = join(CONFIG_DIR, "config-tun.yaml");
const STATE_DIR = join(homedir(), ".config/miho");
const STATE_FILE = join(STATE_DIR, "state");
const PID_FILE = join(STATE_DIR, "mihomo.pid");
const LOG_FILE = join(STATE_DIR, "mihomo.log");
const API = "http://127.0.0.1:7891";
const PROXY = "127.0.0.1:7890";
export const PATHS = { config: CONFIG_PROXY, tun: CONFIG_TUN, log: LOG_FILE, proxy: PROXY } as const;
const TEST_URL = "http://www.gstatic.com/generate_204";
const POLKIT_AGENT = "/usr/lib/polkit-gnome/polkit-gnome-authentication-agent-1";
const SUDO_REFUSED = /^sudo: /m;
const NO_AGENT = /No authentication agent found/;

export interface Status {
	running: boolean;
	pid: number | null;
	mode: Mode;
	routing: Routing;
	routeMode: RouteMode;
	api: boolean;
	tunLink: boolean;
}

export interface Group {
	name: string;
	type: string;
	now: string;
	all: string[];
	testUrl: string | null;
}

export interface HistoryEntry {
	time: string;
	delay: number;
}

export interface ProxyEntry {
	name: string;
	type: string;
	alive?: boolean;
	udp?: boolean;
	tfo?: boolean;
	mptcp?: boolean;
	now?: string;
	all?: string[];
	history?: HistoryEntry[];
	/** Internal field names on the controller are `provider-name` and `dialer-proxy`. */
	provider?: string;
	dialer?: string;
}

export interface Provider {
	name: string;
	vehicleType: string;
	count: number;
	updatedAt: string | null;
	subscription: {
		upload: number;
		download: number;
		total: number;
		expire: number;
	} | null;
}

export interface Connection {
	id: string;
	host: string;
	destination: string;
	process: string;
	network: string;
	type: string;
	chains: string[];
	rule: string;
	geo: string | null;
	upload: number;
	download: number;
	start: string;
}

export interface ConnectionsSnapshot {
	connections: Connection[];
	uploadTotal: number;
	downloadTotal: number;
}

export interface CoreInfo {
	version: string;
	meta: boolean;
	api: boolean;
}

export interface GeoFile {
	name: string;
	size: number;
}

interface RawProxy {
	name?: string;
	type?: string;
	alive?: boolean;
	udp?: boolean;
	tfo?: boolean;
	mptcp?: boolean;
	now?: string;
	all?: string[];
	history?: HistoryEntry[];
	"provider-name"?: string;
	"dialer-proxy"?: string;
}

interface RawProvider {
	name?: string;
	vehicleType?: string;
	proxies?: RawProxy[];
	updatedAt?: string;
	subscriptionInfo?: { Upload?: number; Download?: number; Total?: number; Expire?: number } | null;
}

interface RawConnection {
	id?: string;
	metadata?: {
		host?: string;
		destinationIP?: string;
		destinationPort?: string;
		network?: string;
		type?: string;
		process?: string;
		processPath?: string;
		destinationGeoIP?: string[] | null;
	};
	upload?: number;
	download?: number;
	start?: string;
	chains?: string[];
	rule?: string;
	rulePayload?: string;
}

interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
}

function run(command: string, args: string[], timeout = 10_000): Promise<ExecResult> {
	return new Promise((resolve) => {
		execFile(command, args, { timeout, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
			const code = !error ? 0 : typeof error.code === "number" ? error.code : error.code === "ENOENT" ? 127 : 1;
			resolve({ stdout, stderr, code });
		});
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function startPolkitAgent(): void {
	if (!existsSync(POLKIT_AGENT)) return;
	const child = spawn(POLKIT_AGENT, [], { detached: true, stdio: "ignore" });
	child.on("error", () => {});
	child.unref();
}

/**
 * The policy defaults for `org.freedesktop.policykit.exec` are `auth_admin` on
 * all three scopes, not `_keep`: every pkexec shows a dialog. So each root
 * action is sent as one script, never as one call per step. A cached sudo
 * credential is tried first because it needs no dialog at all.
 */
async function root(script: string): Promise<ExecResult> {
	const viaSudo = await run("sudo", ["-n", "/bin/sh", "-c", script], 300_000);
	if (viaSudo.code === 0 || !SUDO_REFUSED.test(viaSudo.stderr)) return viaSudo;
	let agentStarted = false;
	for (let attempt = 0; attempt < 3; attempt++) {
		// Without this pkexec falls back to its textual agent, which needs a
		// controlling terminal and fails with `No such device or address`.
		const result = await run("pkexec", ["--disable-internal-agent", "/bin/sh", "-c", script], 300_000);
		if (!NO_AGENT.test(result.stderr)) return result;
		if (!agentStarted) {
			agentStarted = true;
			startPolkitAgent();
		}
		await delay(800);
	}
	return { stdout: "", stderr: "no polkit authentication agent answered", code: 127 };
}

function rootError(result: ExecResult): Error {
	if (result.code === 126) return new Error("Root authorization was declined.");
	const detail = lastLine(result.stderr || result.stdout);
	if (detail === "no output") return new Error("Root authorization failed: pkexec or its polkit agent is unavailable.");
	return new Error(detail);
}

function cleanupCommands(): string {
	return `if ip link show Meta >/dev/null 2>&1; then
	ip link delete dev Meta
	resolvectl flush-caches
fi
ip link delete dev tun0 2>/dev/null
true`;
}

export function cleanupScript(): string {
	return cleanupCommands();
}

export function stopScript(pids: number[]): string {
	const list = pids.join(" ");
	if (!list) return cleanupScript();
	return `for pid in ${list}; do kill -TERM "$pid" 2>/dev/null; done
i=0
while [ $i -lt 30 ]; do
	alive=0
	for pid in ${list}; do [ -d "/proc/$pid" ] && alive=1; done
	[ "$alive" -eq 0 ] && break
	sleep 0.1
	i=$((i + 1))
done
for pid in ${list}; do kill -KILL "$pid" 2>/dev/null; done
${cleanupCommands()}`;
}

/** The root half of a TUN start: daemon, ownership, link and resolver. */
export function tunStartScript(): string {
	const dir = shellQuote(CONFIG_DIR);
	const uid = process.getuid?.() ?? 0;
	const gid = process.getgid?.() ?? 0;
	return `${MIHOMO} -d ${dir} -f ${shellQuote(CONFIG_TUN)} > ${shellQuote(LOG_FILE)} 2>&1 &
i=0
while [ $i -lt 50 ]; do
	ip link show Meta >/dev/null 2>&1 && break
	sleep 0.1
	i=$((i + 1))
done
chown -R ${uid}:${gid} ${dir} ${shellQuote(STATE_DIR)}
resolvectl dnsovertls Meta no
resolvectl dns Meta 198.18.0.2
resolvectl domain Meta '~.'
resolvectl flush-caches
true`;
}

function readFileSafe(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

function requireConfig(path: string): string {
	const text = readFileSafe(path);
	if (!text) throw new Error(`${path} is missing. Create the mihomo config first.`);
	return text;
}

function readProcCmdline(pid: number): string {
	return readFileSafe(`/proc/${pid}/cmdline`);
}

function readState(): Mode {
	return /^MODE=tun$/m.test(readFileSafe(STATE_FILE)) ? "tun" : "proxy";
}

function saveState(mode: Mode): void {
	mkdirSync(STATE_DIR, { recursive: true });
	writeFileSync(STATE_FILE, `MODE=${mode}\n`);
}

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function findPids(): Promise<number[]> {
	const result = await run("pgrep", ["-x", "mihomo"], 3000);
	if (result.code !== 0) return [];
	return result.stdout
		.split("\n")
		.map((line) => Number(line.trim()))
		.filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function apiJson<T>(path: string, timeout = 2000): Promise<T> {
	const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(timeout) });
	if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
	return (await response.json()) as T;
}

async function apiPut(path: string, body?: unknown): Promise<void> {
	const response = await fetch(`${API}${path}`, {
		method: "PUT",
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(8000),
	});
	if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
}

async function apiDelete(path: string): Promise<void> {
	const response = await fetch(`${API}${path}`, { method: "DELETE", signal: AbortSignal.timeout(5000) });
	if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
}

async function apiPatch(path: string, body: unknown): Promise<void> {
	const response = await fetch(`${API}${path}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(5000),
	});
	if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
}

function lastLine(text: string): string {
	const line = text
		.trim()
		.split("\n")
		.filter((entry) => entry.trim())
		.slice(-1)[0];
	if (!line) return "no output";
	return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}

function spawnDetached(command: string, args: string[]): void {
	mkdirSync(STATE_DIR, { recursive: true });
	const log = openSync(LOG_FILE, "w");
	const child = spawn(command, args, { detached: true, stdio: ["ignore", log, log] });
	child.on("error", () => {});
	child.unref();
	closeSync(log);
}

async function waitForPid(timeout: number): Promise<number | null> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const pids = await findPids();
		if (pids.length) {
			try {
				await apiJson("/version", 600);
				return pids[0] ?? null;
			} catch {
				// the process exists but the controller is still binding
			}
		}
		await delay(100);
	}
	return null;
}

export async function readStatus(): Promise<Status> {
	const pids = await findPids();
	const pid = pids[0] ?? null;
	const running = pid !== null && isAlive(pid);
	const cmdline = running && pid !== null ? readProcCmdline(pid) : "";
	const mode = (running ? parseModeFromCmdline(cmdline) : null) ?? readState();
	let api = false;
	let routeMode: RouteMode = "rule";
	if (running) {
		try {
			const configs = await apiJson<{ mode?: string }>("/configs", 800);
			api = true;
			routeMode = parseRouteMode(configs.mode);
		} catch {
			api = false;
		}
	}
	const tunLink = mode === "tun" ? (await run("ip", ["link", "show", "Meta"], 2000)).code === 0 : false;
	return { running, pid, mode, routing: readRouting(readFileSafe(CONFIG_PROXY)), routeMode, api, tunLink };
}

function toEntry(raw: RawProxy): ProxyEntry {
	return {
		name: raw.name ?? "",
		type: raw.type ?? "",
		alive: raw.alive,
		udp: raw.udp,
		tfo: raw.tfo,
		mptcp: raw.mptcp,
		now: raw.now,
		all: raw.all,
		history: raw.history,
		provider: raw["provider-name"],
		dialer: raw["dialer-proxy"],
	};
}

/** The last health check the controller ran, not a new one. */
export function lastDelay(entry: ProxyEntry | undefined): number | undefined {
	const history = entry?.history ?? [];
	return history[history.length - 1]?.delay;
}

function groupFrom(raw: RawProxy, testUrl: string | null): Group {
	return {
		name: raw.name ?? "",
		type: raw.type ?? "",
		now: raw.now ?? "",
		all: raw.all ?? [],
		testUrl,
	};
}

export async function readGroups(): Promise<Group[]> {
	const data = await apiJson<{ proxies: Record<string, RawProxy & { testUrl?: string }> }>("/proxies");
	return Object.values(data.proxies)
		.filter((group) => ["Selector", "URLTest", "Fallback"].includes(group.type ?? ""))
		.map((group) => groupFrom(group, group.testUrl ?? null))
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readGroup(name: string): Promise<Group> {
	const group = await apiJson<RawProxy & { testUrl?: string }>(`/proxies/${encodeURIComponent(name)}`);
	return groupFrom(group, group.testUrl ?? null);
}

/**
 * Provider nodes are not listed under `/proxies`; a group's `all` names them
 * and only `/providers/proxies` carries their type, flags and last delay.
 */
export async function readProxies(): Promise<Record<string, ProxyEntry>> {
	const [direct, providers] = await Promise.all([
		apiJson<{ proxies: Record<string, RawProxy> }>("/proxies"),
		apiJson<{ providers: Record<string, RawProvider> }>("/providers/proxies"),
	]);
	const entries: Record<string, ProxyEntry> = {};
	for (const provider of Object.values(providers.providers)) {
		for (const raw of provider.proxies ?? []) {
			if (!raw.name) continue;
			entries[raw.name] = toEntry({ ...raw, "provider-name": raw["provider-name"] ?? provider.name });
		}
	}
	for (const [name, raw] of Object.entries(direct.proxies)) {
		entries[name] = toEntry({ ...raw, name });
	}
	return entries;
}

export async function delayGroup(name: string, testUrl: string | null): Promise<Record<string, number>> {
	const query = new URLSearchParams({ url: testUrl ?? TEST_URL, timeout: "2000" });
	return apiJson<Record<string, number>>(`/group/${encodeURIComponent(name)}/delay?${query.toString()}`, 6000);
}

/**
 * Selecting in a group also points PROXY at that group, because the top rule
 * is `MATCH,PROXY` and the script's helper did the same.
 */
export async function selectNode(group: string, node: string): Promise<string> {
	await apiPut(`/proxies/${encodeURIComponent(group)}`, { name: node });
	const groups = await readGroups();
	const top = groups.find((entry) => entry.name === "PROXY");
	if (group !== "PROXY" && top?.all.includes(group) && top.now !== group) {
		await apiPut(`/proxies/${encodeURIComponent("PROXY")}`, { name: group });
	}
	return node;
}

export async function readProviders(): Promise<Provider[]> {
	const data = await apiJson<{ providers: Record<string, RawProvider> }>("/providers/proxies");
	return Object.values(data.providers)
		.filter((provider) => provider.vehicleType && provider.vehicleType !== "Compatible")
		.map((provider) => {
			const info = provider.subscriptionInfo;
			return {
				name: provider.name ?? "",
				vehicleType: provider.vehicleType ?? "",
				count: provider.proxies?.length ?? 0,
				updatedAt: provider.updatedAt ?? null,
				subscription: info
					? {
							upload: info.Upload ?? 0,
							download: info.Download ?? 0,
							total: info.Total ?? 0,
							expire: info.Expire ?? 0,
						}
					: null,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readConnections(): Promise<ConnectionsSnapshot> {
	const data = await apiJson<{
		connections?: RawConnection[];
		uploadTotal?: number;
		downloadTotal?: number;
	}>("/connections", 3000);
	const connections = (data.connections ?? [])
		.filter((raw) => raw.id)
		.map((raw) => {
			const meta = raw.metadata ?? {};
			const host = meta.host || meta.destinationIP || "unknown";
			const process = meta.process || (meta.processPath ? basename(meta.processPath) : "");
			return {
				id: raw.id ?? "",
				host,
				destination: `${meta.destinationIP ?? "?"}:${meta.destinationPort ?? "?"}`,
				process,
				network: meta.network ?? "",
				type: meta.type ?? "",
				chains: raw.chains ?? [],
				rule: [raw.rule, raw.rulePayload].filter(Boolean).join(","),
				geo: meta.destinationGeoIP?.join(", ") || null,
				upload: raw.upload ?? 0,
				download: raw.download ?? 0,
				start: raw.start ?? "",
			};
		})
		.sort((left, right) => right.start.localeCompare(left.start));
	return {
		connections,
		uploadTotal: data.uploadTotal ?? 0,
		downloadTotal: data.downloadTotal ?? 0,
	};
}

export async function closeConnection(id: string): Promise<string> {
	await apiDelete(`/connections/${encodeURIComponent(id)}`);
	return "Connection closed";
}

export async function closeAllConnections(): Promise<string> {
	await apiDelete("/connections");
	return "All connections closed";
}

export async function updateProvider(name: string): Promise<string> {
	await apiPut(`/providers/proxies/${encodeURIComponent(name)}`);
	return `Updated ${name}`;
}

export async function updateAllProviders(): Promise<string> {
	const providers = await readProviders();
	if (!providers.length) return "No providers to update";
	await Promise.all(providers.map((provider) => apiPut(`/providers/proxies/${encodeURIComponent(provider.name)}`)));
	return `Updated ${providers.length} provider${providers.length === 1 ? "" : "s"}`;
}

async function reloadDaemon(pid: number): Promise<void> {
	try {
		process.kill(pid, "SIGHUP");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
		const result = await root(`kill -HUP ${pid}`);
		if (result.code !== 0) throw rootError(result);
	}
}

function removePidFile(): void {
	try {
		rmSync(PID_FILE, { force: true });
	} catch {
		// the hint file is not the source of truth
	}
}

async function canSignal(pid: number): Promise<boolean> {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "EPERM";
	}
}

async function tunLinkPresent(): Promise<boolean> {
	if ((await run("ip", ["link", "show", "Meta"], 2000)).code === 0) return true;
	return (await run("ip", ["link", "show", "tun0"], 2000)).code === 0;
}

async function removeTunLinks(): Promise<void> {
	const result = await root(cleanupScript());
	if (result.code !== 0) throw rootError(result);
}

async function stopOwnDaemon(pid: number): Promise<void> {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return;
	}
	for (let attempt = 0; attempt < 30; attempt++) {
		if (!isAlive(pid)) return;
		await delay(100);
	}
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// already gone
	}
}

export async function startMihomo(mode: Mode): Promise<string> {
	const running = await findPids();
	if (running.length) return "mihomo is already running";
	if (!existsSync(MIHOMO)) throw new Error(`${MIHOMO} is missing. Install mihomo first.`);

	mkdirSync(STATE_DIR, { recursive: true });
	if (mode === "tun") {
		const config = requireConfig(CONFIG_PROXY);
		writeFileSync(CONFIG_TUN, buildTunConfig(config));
		const test = await run(MIHOMO, ["-t", "-d", CONFIG_DIR, "-f", CONFIG_TUN], 20_000);
		if (test.code !== 0) {
			throw new Error(`The generated TUN config is invalid: ${lastLine(test.stderr || test.stdout)}`);
		}
		const started = await root(tunStartScript());
		if (started.code !== 0) throw rootError(started);
	} else {
		requireConfig(CONFIG_PROXY);
		spawnDetached(MIHOMO, ["-d", CONFIG_DIR, "-f", CONFIG_PROXY]);
	}

	const pid = await waitForPid(8000);
	if (!pid) throw new Error(`mihomo did not start: ${lastLine(readFileSafe(LOG_FILE))}`);
	writeFileSync(PID_FILE, `${pid}\n`);
	saveState(mode);
	return mode === "tun" ? "mihomo started in TUN mode" : "mihomo started in proxy mode";
}

export async function stopMihomo(): Promise<string> {
	const pids = await findPids();
	if (!pids.length) {
		if (await tunLinkPresent()) await removeTunLinks();
		removePidFile();
		return "mihomo was not running";
	}
	const owned = (await Promise.all(pids.map(canSignal))).every(Boolean);
	if (owned) {
		for (const pid of pids) await stopOwnDaemon(pid);
		if (await tunLinkPresent()) await removeTunLinks();
	} else {
		const result = await root(stopScript(pids));
		if (result.code !== 0) throw rootError(result);
	}
	removePidFile();
	return "mihomo stopped";
}

export async function restartMihomo(): Promise<string> {
	const status = await readStatus();
	await stopMihomo();
	return startMihomo(status.mode);
}

export async function setMode(mode: Mode): Promise<string> {
	const status = await readStatus();
	const label = mode === "tun" ? "TUN" : "proxy";
	if (status.running && status.mode === mode) return `Already running in ${label} mode`;
	if (status.running) await stopMihomo();
	return startMihomo(mode);
}

export async function setRoutingEnabled(enableProxy: boolean): Promise<string> {
	const next = applyRouting(requireConfig(CONFIG_PROXY), enableProxy ? "proxy" : "direct");
	writeFileSync(CONFIG_PROXY, next);
	const pids = await findPids();
	const pid = pids[0] ?? null;
	const mode = (pid !== null ? parseModeFromCmdline(readProcCmdline(pid)) : null) ?? readState();
	if (mode === "tun") writeFileSync(CONFIG_TUN, buildTunConfig(next));
	for (const entry of pids) await reloadDaemon(entry);
	return enableProxy ? "Routing through the proxy" : "Routing direct";
}

export async function setRouteMode(mode: RouteMode): Promise<string> {
	await apiPatch("/configs", { mode });
	return `Mihomo mode: ${mode}`;
}

export async function testProxy(): Promise<{ status: string; seconds: string }> {
	const result = await run(
		"curl",
		["-s", "--max-time", "12", "--socks5-hostname", PROXY, "-o", "/dev/null", "-w", "%{http_code} %{time_total}", TEST_URL],
		15_000,
	);
	if (result.code !== 0) throw new Error(`curl failed: ${lastLine(result.stderr)}`);
	const [status = "000", seconds = "0"] = result.stdout.trim().split(" ");
	if (status === "000") throw new Error("the proxy did not answer");
	return { status, seconds: Number(seconds).toFixed(2) };
}

export async function directIp(): Promise<string> {
	const response = await fetch("https://ipinfo.io/ip", { signal: AbortSignal.timeout(6000) });
	if (!response.ok) throw new Error(`ipinfo.io returned HTTP ${response.status}`);
	return (await response.text()).trim();
}

export async function proxiedIp(): Promise<string> {
	const result = await run(
		"curl",
		["-s", "--max-time", "12", "--socks5-hostname", PROXY, "https://ipinfo.io/ip"],
		15_000,
	);
	if (result.code !== 0) throw new Error(`curl failed: ${lastLine(result.stderr)}`);
	const value = result.stdout.trim();
	if (!value) throw new Error("the proxy returned an empty address");
	return value;
}

export function tailLog(lines = 40): string {
	const text = readFileSafe(LOG_FILE).trimEnd();
	if (!text) return "No log yet.";
	return text.split("\n").slice(-lines).join("\n");
}

/** The controller knows its own tag; a stopped core is asked directly. */
export async function readCore(): Promise<CoreInfo> {
	try {
		const data = await apiJson<{ version?: string; meta?: boolean }>("/version", 800);
		return { version: data.version ?? "unknown", meta: Boolean(data.meta), api: true };
	} catch {
		const result = await run(MIHOMO, ["-v"], 3000);
		return {
			version: parseCoreVersion(result.stdout) ?? "not installed",
			meta: /Mihomo Meta/i.test(result.stdout),
			api: false,
		};
	}
}

export async function testConfig(): Promise<string> {
	const result = await run(MIHOMO, ["-t", "-d", CONFIG_DIR, "-f", CONFIG_PROXY], 20_000);
	if (result.code !== 0) throw new Error(lastLine(result.stderr || result.stdout));
	return "Configuration is valid";
}

/** Geo databases sit next to the config and are named by their format, not by mihomo. */
export function readGeoFiles(): GeoFile[] {
	try {
		return readdirSync(CONFIG_DIR)
			.filter((name) => /\.(dat|metadb|mrs)$/.test(name))
			.map((name) => ({ name, size: statSync(join(CONFIG_DIR, name)).size }))
			.sort((left, right) => left.name.localeCompare(right.name));
	} catch {
		return [];
	}
}
