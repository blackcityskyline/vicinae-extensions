import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
	buildTunConfig,
	parseModeFromCmdline,
	readRouting,
	setRouting as applyRouting,
	type Mode,
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
const TEST_URL = "http://www.gstatic.com/generate_204";
const SUDO_HINT = "mihomo runs as root and sudo is not authorized. Use Authorize Sudo, then retry.";

export interface Status {
	running: boolean;
	pid: number | null;
	mode: Mode;
	routing: Routing;
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

export interface ProxyEntry {
	name: string;
	type: string;
	alive?: boolean;
	udp?: boolean;
	now?: string;
	all?: string[];
	testUrl?: string;
}

export interface Provider {
	name: string;
	vehicleType: string;
	count: number;
	updatedAt: string | null;
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
	if (running) {
		try {
			await apiJson("/version", 800);
			api = true;
		} catch {
			api = false;
		}
	}
	const tunLink = mode === "tun" ? (await run("ip", ["link", "show", "Meta"], 2000)).code === 0 : false;
	return { running, pid, mode, routing: readRouting(readFileSafe(CONFIG_PROXY)), api, tunLink };
}

export async function readGroups(): Promise<Group[]> {
	const data = await apiJson<{ proxies: Record<string, ProxyEntry> }>("/proxies");
	return Object.values(data.proxies)
		.filter((group) => group.name !== "GLOBAL" && ["Selector", "URLTest", "Fallback"].includes(group.type))
		.map((group) => ({
			name: group.name,
			type: group.type,
			now: group.now ?? "",
			all: group.all ?? [],
			testUrl: group.testUrl ?? null,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function readGroup(name: string): Promise<Group> {
	const group = await apiJson<ProxyEntry>(`/proxies/${encodeURIComponent(name)}`);
	return {
		name: group.name,
		type: group.type,
		now: group.now ?? "",
		all: group.all ?? [],
		testUrl: group.testUrl ?? null,
	};
}

export async function readProxies(): Promise<Record<string, ProxyEntry>> {
	const data = await apiJson<{ proxies: Record<string, ProxyEntry> }>("/proxies");
	return data.proxies;
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
	const data = await apiJson<{
		providers: Record<
			string,
			{ name: string; vehicleType?: string; proxies?: Array<{ alive?: boolean }>; updatedAt?: string }
		>;
	}>("/providers/proxies");
	return Object.values(data.providers)
		.filter((provider) => provider.vehicleType && provider.vehicleType !== "Compatible")
		.map((provider) => {
			const nodes = provider.proxies ?? [];
			return {
				name: provider.name,
				vehicleType: provider.vehicleType ?? "",
				count: nodes.length,
				updatedAt: provider.updatedAt ?? null,
			};
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

export async function updateProvider(name: string): Promise<string> {
	await apiPut(`/providers/proxies/${encodeURIComponent(name)}`);
	return `Updated ${name}`;
}

async function signalDaemon(pid: number, name: "SIGTERM" | "SIGKILL" | "SIGHUP"): Promise<void> {
	try {
		process.kill(pid, name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
		const flag = name === "SIGKILL" ? "-9" : name === "SIGHUP" ? "-1" : "-15";
		const result = await run("sudo", ["-n", "kill", flag, String(pid)], 5000);
		if (result.code !== 0) throw new Error(SUDO_HINT);
	}
}

async function cleanupTun(): Promise<void> {
	const meta = await run("ip", ["link", "show", "Meta"], 3000);
	if (meta.code === 0) {
		await run("sudo", ["-n", "ip", "link", "delete", "dev", "Meta"], 5000);
		await run("sudo", ["-n", "resolvectl", "flush-caches"], 5000);
	}
	await run("sudo", ["-n", "ip", "link", "delete", "dev", "tun0"], 5000);
}

function removePidFile(): void {
	try {
		rmSync(PID_FILE, { force: true });
	} catch {
		// the hint file is not the source of truth
	}
}

async function finishTun(): Promise<void> {
	const uid = process.getuid?.() ?? 0;
	const gid = process.getgid?.() ?? 0;
	await run("sudo", ["-n", "chown", "-R", `${uid}:${gid}`, CONFIG_DIR, STATE_DIR], 15_000);
	for (let attempt = 0; attempt < 50; attempt++) {
		if ((await run("ip", ["link", "show", "Meta"], 2000)).code === 0) break;
		await delay(100);
	}
	await run("sudo", ["-n", "resolvectl", "dnsovertls", "Meta", "no"], 5000);
	await run("sudo", ["-n", "resolvectl", "dns", "Meta", "198.18.0.2"], 5000);
	await run("sudo", ["-n", "resolvectl", "domain", "Meta", "~."], 5000);
	await run("sudo", ["-n", "resolvectl", "flush-caches"], 5000);
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
		const sudo = await run("sudo", ["-n", "true"], 5000);
		if (sudo.code !== 0) throw new Error("TUN mode needs root and sudo is not authorized. Use Authorize Sudo, then retry.");
		spawnDetached("sudo", ["-n", MIHOMO, "-d", CONFIG_DIR, "-f", CONFIG_TUN]);
	} else {
		requireConfig(CONFIG_PROXY);
		spawnDetached(MIHOMO, ["-d", CONFIG_DIR, "-f", CONFIG_PROXY]);
	}

	const pid = await waitForPid(8000);
	if (!pid) throw new Error(`mihomo did not start: ${lastLine(readFileSafe(LOG_FILE))}`);
	if (mode === "tun") await finishTun();
	writeFileSync(PID_FILE, `${pid}\n`);
	saveState(mode);
	return mode === "tun" ? "mihomo started in TUN mode" : "mihomo started in proxy mode";
}

export async function stopMihomo(): Promise<string> {
	const pids = await findPids();
	if (!pids.length) {
		await cleanupTun();
		removePidFile();
		return "mihomo was not running";
	}
	for (const pid of pids) {
		await signalDaemon(pid, "SIGTERM");
		for (let attempt = 0; attempt < 30; attempt++) {
			if (!isAlive(pid)) break;
			await delay(100);
		}
		if (isAlive(pid)) await signalDaemon(pid, "SIGKILL");
	}
	await cleanupTun();
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
	for (const entry of pids) await signalDaemon(entry, "SIGHUP");
	return enableProxy ? "Routing through the proxy" : "Routing direct";
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
