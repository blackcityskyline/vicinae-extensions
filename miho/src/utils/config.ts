export type Mode = "proxy" | "tun";
export type Routing = "proxy" | "direct" | "unknown";
export type RouteMode = "rule" | "global" | "direct";

/** `/configs` reports the mihomo mode; anything unknown stays on `rule`. */
export function parseRouteMode(value: string | undefined): RouteMode {
	return value === "global" || value === "direct" ? value : "rule";
}

/**
 * `mihomo -v` prints `Mihomo Meta v1.19.33 linux amd64 with go…`; the controller
 * prints the bare tag. Both end up in the same label.
 */
export function parseCoreVersion(text: string): string | null {
	return text.match(/\bv\d+\.\d+\.\d+(?:[-\w.]+)?/i)?.[0] ?? null;
}

const PROXY_CONFIG = "config.yaml";
const TUN_CONFIG = "config-tun.yaml";

/**
 * `/proc/<pid>/cmdline` is NUL-separated; the log and tests use spaces. The
 * daemon is identified by the config it was started with, not by the state
 * file, which survives a crash.
 */
export function parseModeFromCmdline(cmdline: string): Mode | null {
	const args = cmdline.includes("\0") ? cmdline.split("\0") : cmdline.split(/\s+/);
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg !== "-f" && arg !== "--config") continue;
		const file = (args[index + 1] ?? "").split("/").pop();
		if (file === TUN_CONFIG) return "tun";
		if (file === PROXY_CONFIG) return "proxy";
	}
	return null;
}

/**
 * The state in `/proc/<pid>/stat`, read after the last `)`: a zombie still
 * answers `kill(pid, 0)`, so liveness cannot come from the signal alone.
 */
export function isZombieStat(stat: string): boolean {
	const end = stat.lastIndexOf(")");
	if (end === -1) return false;
	const state = stat.charAt(end + 2);
	return state === "Z" || state === "X" || state === "x";
}

// The script toggles routing with `sed` on this one rule. Keeping the same
// contract means a mode chosen in the launcher is what the CLI reports.
const MATCH_RULE = /^(\s*-\s*MATCH,)(PROXY|DIRECT)(\s*)$/gm;

export function readRouting(config: string): Routing {
	const rules = [...config.matchAll(MATCH_RULE)];
	const value = rules[rules.length - 1]?.[2];
	if (value === "PROXY") return "proxy";
	if (value === "DIRECT") return "direct";
	return "unknown";
}

export function setRouting(config: string, routing: Exclude<Routing, "unknown">): string {
	let changed = false;
	const next = config.replace(MATCH_RULE, (_line, head: string, _value: string, tail: string) => {
		changed = true;
		return `${head}${routing.toUpperCase()}${tail}`;
	});
	if (!changed) throw new Error("config.yaml has no MATCH rule; routing cannot be changed");
	return next;
}

const TUN_BLOCK = `# ------------------------------------------
# TUN
# ------------------------------------------
tun:
  enable: true
  stack: mixed
  device: Meta
  auto-route: true
  auto-detect-interface: true
  dns-hijack:
    - any:53
    - tcp://any:53
`;

/**
 * The script strips every top-level `tun:` block from `config.yaml` and appends
 * its own. The result is checked with `mihomo -t` before it is used.
 */
export function buildTunConfig(proxyConfig: string): string {
	const stripped = proxyConfig
		.replace(/^tun:[ \t]*\r?\n(?:[ \t]+[^\n]*\r?\n|\r?\n)*/m, "")
		.trimEnd()
		.replace(/\n*# -+\r?\n# TUN\r?\n# -+\s*$/, "")
		.trimEnd();
	if (/^tun:/m.test(stripped)) throw new Error("config.yaml has a tun block that could not be removed");
	return `${stripped}\n\n${TUN_BLOCK}`;
}

/**
 * Unanswered nodes go last. The controller omits them from the delay map and
 * reports a failed health check as 0, so both have to sink.
 */
export function sortNodes(nodes: string[], delays: Record<string, number | undefined>): string[] {
	const value = (node: string) => delays[node] || Number.POSITIVE_INFINITY;
	return [...nodes].sort((left, right) => value(left) - value(right) || left.localeCompare(right));
}
