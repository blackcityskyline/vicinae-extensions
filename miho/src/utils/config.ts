export type Mode = "proxy" | "tun";
export type Routing = "proxy" | "direct" | "unknown";

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

/** Unanswered nodes go last; the controller omits them from the delay map. */
export function sortNodes(nodes: string[], delays: Record<string, number | undefined>): string[] {
	return [...nodes].sort((left, right) => {
		const a = delays[left] ?? Number.POSITIVE_INFINITY;
		const b = delays[right] ?? Number.POSITIVE_INFINITY;
		return a - b || left.localeCompare(right);
	});
}
