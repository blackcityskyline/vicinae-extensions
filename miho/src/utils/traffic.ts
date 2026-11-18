/**
 * Live traffic is derived from the cumulative counters that the controller keeps
 * per connection. Only the rate tracker carries state between polls; the rest is
 * a pure function over one snapshot.
 */

export type ConnectionCounters = {
	id: string;
	upload: number;
	download: number;
};

export type Rate = {
	down: number;
	up: number;
};

export type TrackedConnection = ConnectionCounters & {
	process: string;
	host: string;
	chains: string[];
};

export type Routing = "direct" | "proxy";

export type ProcessTraffic = {
	name: string;
	down: number;
	up: number;
	downTotal: number;
	upTotal: number;
	connections: number;
	hosts: string[];
	routing: Routing | "mixed";
};

/**
 * The controller does not count per second: a connection's counters jump in one
 * batch every few seconds (4 to 7 s measured on v1.19.34), so a one-second delta
 * reads zero until the next batch and a plain average decays between batches.
 * The rate therefore steps at each batch — the batch's bytes over the time since
 * the previous one — and is held until the next batch, but no longer than
 * `holdMs`: a connection that has really stopped must fall to zero.
 *
 * A connection that has just appeared has no previous counters, so it reports
 * nothing for one tick instead of its whole life as one second. Counters reset
 * when the daemon restarts: a negative delta is clamped, not subtracted.
 */
export type RateTracker = {
	tick(connections: readonly ConnectionCounters[], at: number): Map<string, Rate>;
};

export function rateTracker(holdMs = 10_000): RateTracker {
	let previous: { at: number; counters: Map<string, ConnectionCounters> } | null = null;
	const held = new Map<string, { rate: Rate; at: number }>();

	return {
		tick(connections, at) {
			const rates = new Map<string, Rate>();
			const counters = new Map<string, ConnectionCounters>();
			const seconds = previous ? (at - previous.at) / 1000 : 0;
			for (const connection of connections) {
				counters.set(connection.id, connection);
				const before = previous?.counters.get(connection.id);
				if (!before) continue;
				if (connection.download < before.download || connection.upload < before.upload) {
					held.set(connection.id, { rate: { down: 0, up: 0 }, at });
					rates.set(connection.id, { down: 0, up: 0 });
					continue;
				}
				if (connection.download === before.download && connection.upload === before.upload) {
					const kept = held.get(connection.id);
					if (kept && at - kept.at <= holdMs) rates.set(connection.id, kept.rate);
					else rates.set(connection.id, { down: 0, up: 0 });
					continue;
				}
				if (!(seconds > 0)) continue;
				const rate = {
					down: (connection.download - before.download) / seconds,
					up: (connection.upload - before.upload) / seconds,
				};
				held.set(connection.id, { rate, at });
				rates.set(connection.id, rate);
			}
			for (const id of [...held.keys()]) if (!counters.has(id)) held.delete(id);
			previous = { at, counters };
			return rates;
		},
	};
}

/** A direct connection is the one whose chain is the built-in `DIRECT`. */
export function routingOf(chains: readonly string[]): Routing {
	return chains.length === 0 || chains[0] === "DIRECT" ? "direct" : "proxy";
}

function rateTotal(rates: ReadonlyMap<string, Rate>, id: string): number {
	const rate = rates.get(id);
	return rate ? rate.down + rate.up : 0;
}

/** Busiest first, so the first row is what is moving right now. */
export function byRate<T extends ConnectionCounters>(connections: readonly T[], rates: ReadonlyMap<string, Rate>): T[] {
	return [...connections].sort((left, right) => {
		const difference = rateTotal(rates, right.id) - rateTotal(rates, left.id);
		if (difference !== 0) return difference;
		return left.id.localeCompare(right.id);
	});
}

const UNKNOWN_PROCESS = "unknown process";

/**
 * One row per process: what it is moving now, the same in total, where it goes
 * and whether it goes direct or through the tunnel. A process with both kinds of
 * connection is `mixed`.
 */
export function perProcess(
	connections: readonly TrackedConnection[],
	rates: ReadonlyMap<string, Rate>,
): ProcessTraffic[] {
	const groups = new Map<string, ProcessTraffic>();
	for (const connection of connections) {
		const name = connection.process || UNKNOWN_PROCESS;
		const rate = rates.get(connection.id) ?? { down: 0, up: 0 };
		const group = groups.get(name) ?? {
			name,
			down: 0,
			up: 0,
			downTotal: 0,
			upTotal: 0,
			connections: 0,
			hosts: [],
			routing: routingOf(connection.chains),
		};
		group.down += rate.down;
		group.up += rate.up;
		group.downTotal += connection.download;
		group.upTotal += connection.upload;
		group.connections += 1;
		if (!group.hosts.includes(connection.host) && group.hosts.length < 8) group.hosts.push(connection.host);
		const routing = routingOf(connection.chains);
		if (group.routing !== routing) group.routing = "mixed";
		groups.set(name, group);
	}
	return [...groups.values()].sort((left, right) => {
		const difference = right.down + right.up - (left.down + left.up);
		if (difference !== 0) return difference;
		return left.name.localeCompare(right.name);
	});
}

const FIND_PROCESS_LINE = /^find-process-mode:[ \t]*(.*)$/m;

/**
 * Without `always` the controller only resolves a process when a rule matches on
 * one, so most rows have no name — measured on mihomo v1.19.34: an empty
 * `process` and `processPath` for a loopback connection until this key was set.
 */
export function readFindProcessMode(config: string): string | null {
	return config.match(FIND_PROCESS_LINE)?.[1]?.trim() ?? null;
}

export function withFindProcessMode(config: string, mode: "always" | "strict" | "off"): string {
	const line = `find-process-mode: ${mode}`;
	if (FIND_PROCESS_LINE.test(config)) return config.replace(FIND_PROCESS_LINE, line);
	const modeLine = /^mode:.*$/m;
	if (modeLine.test(config)) return config.replace(modeLine, (found) => `${found}\n${line}`);
	return `${line}\n${config}`;
}
