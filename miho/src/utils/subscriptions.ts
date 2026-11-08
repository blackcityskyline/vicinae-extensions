export interface Subscription {
	name: string;
	url: string;
	interval: number;
}

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const HEADER = /^proxy-providers:[ \t]*$/m;

function assertName(name: string): void {
	if (!NAME.test(name)) throw new Error("Use a lowercase name of letters, digits, - and _ (max 32).");
}

function assertUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("The subscription URL is not valid.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("The subscription URL must be http or https.");
	}
}

function assertInterval(interval: number): void {
	if (!Number.isInteger(interval) || interval < 0) throw new Error("The interval must be a whole number of seconds.");
}

/**
 * A provider block runs from `proxy-providers:` to the next column-0 key.
 * Comments and blank lines stay inside it, so a new provider lands after the
 * user's own comments instead of splitting them.
 */
function sectionBounds(config: string): { start: number; end: number } | null {
	const match = HEADER.exec(config);
	if (!match) return null;
	const bodyStart = match.index + match[0].length;
	const next = config.slice(bodyStart).search(/^[^ \t#\r\n]/m);
	return { start: match.index, end: next === -1 ? config.length : bodyStart + next };
}

function stripQuotes(value: string): string {
	return value.replace(/^["']|["']$/g, "");
}

export function readSubscriptions(config: string): Subscription[] {
	const bounds = sectionBounds(config);
	if (!bounds) return [];
	const found: Subscription[] = [];
	let current: Subscription | null = null;
	for (const line of config.slice(bounds.start, bounds.end).split("\n")) {
		const name = line.match(/^  ([a-z0-9][a-z0-9_-]*):[ \t]*$/);
		if (name) {
			current = { name: name[1] ?? "", url: "", interval: 0 };
			if (current.name) found.push(current);
			continue;
		}
		if (!current) continue;
		const url = line.match(/^ {4}url:[ \t]*["']?([^"'\n]+?)["']?[ \t]*$/);
		if (url) current.url = (url[1] ?? "").trim();
		const interval = line.match(/^ {4}interval:[ \t]*(\d+)[ \t]*$/);
		if (interval) current.interval = Number(interval[1]);
	}
	return found;
}

function providerBlock(sub: Subscription): string {
	return `  ${sub.name}:
    type: http
    url: "${sub.url.replace(/"/g, '\\"')}"
    path: ./providers/${sub.name}.yaml
    interval: ${sub.interval}
    health-check:
      enable: true
      interval: 60
      timeout: 5
      url: "http://www.gstatic.com/generate_204"
      expected-status: 204
`;
}

/** A provider nobody uses shows no nodes, so it joins every group that already has a `use:` list. */
function addToGroups(config: string, name: string): string {
	const lines = config.split("\n");
	const out: string[] = [];
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? "";
		out.push(line);
		const use = line.match(/^([ \t]*)use:[ \t]*$/);
		if (!use) continue;
		const indent = use[1] ?? "";
		let present = false;
		for (let scan = index + 1; scan < lines.length; scan++) {
			const item = (lines[scan] ?? "").match(/^([ \t]*)-[ \t]*(.+?)[ \t]*$/);
			if (!item || (item[1] ?? "").length <= indent.length) break;
			if (stripQuotes(item[2] ?? "") === name) {
				present = true;
				break;
			}
		}
		if (!present) out.push(`${indent}  - ${name}`);
	}
	return out.join("\n");
}

function removeFromGroups(config: string, name: string): string {
	const lines = config.split("\n");
	const out: string[] = [];
	let useIndent: number | null = null;
	for (const line of lines) {
		const use = line.match(/^([ \t]*)use:[ \t]*$/);
		if (use) {
			useIndent = (use[1] ?? "").length;
			out.push(line);
			continue;
		}
		if (useIndent !== null) {
			const item = line.match(/^([ \t]*)-[ \t]*(.+?)[ \t]*$/);
			if (item && (item[1] ?? "").length > useIndent) {
				if (stripQuotes(item[2] ?? "") === name) continue;
				out.push(line);
				continue;
			}
			const blank = line.trim() === "" || line.trimStart().startsWith("#");
			if (!blank && (line.match(/^[ \t]*/)?.[0].length ?? 0) <= useIndent) useIndent = null;
		}
		out.push(line);
	}
	return out.join("\n");
}

export function addSubscription(config: string, sub: Subscription): string {
	assertName(sub.name);
	assertUrl(sub.url);
	assertInterval(sub.interval);
	if (readSubscriptions(config).some((entry) => entry.name === sub.name)) {
		throw new Error(`Subscription ${sub.name} already exists.`);
	}
	const base = config.replace(/^proxy-providers:[ \t]*\{[ \t]*\}[ \t]*$/m, "proxy-providers:");
	const header = HEADER.exec(base);
	const block = providerBlock(sub);
	let next: string;
	if (header) {
		const insertAt = header.index + header[0].length;
		next = `${base.slice(0, insertAt)}\n${block}${base.slice(insertAt)}`;
	} else {
		next = `${base.trimEnd()}\n\nproxy-providers:\n${block}`;
	}
	return addToGroups(next, sub.name);
}

export function setSubscription(config: string, name: string, spec: { url: string; interval: number }): string {
	assertUrl(spec.url);
	assertInterval(spec.interval);
	const bounds = sectionBounds(config);
	if (!bounds) throw new Error(`Subscription ${name} is not in the config.`);
	let current = false;
	let found = false;
	const lines = config
		.slice(bounds.start, bounds.end)
		.split("\n")
		.map((line) => {
			const provider = line.match(/^  ([a-z0-9][a-z0-9_-]*):[ \t]*$/);
			if (provider) {
				current = (provider[1] ?? "") === name;
				if (current) found = true;
				return line;
			}
			if (!current) return line;
			if (/^ {4}url:/.test(line)) return `    url: "${spec.url.replace(/"/g, '\\"')}"`;
			if (/^ {4}interval:/.test(line)) return `    interval: ${spec.interval}`;
			return line;
		});
	if (!found) throw new Error(`Subscription ${name} is not in the config.`);
	return config.slice(0, bounds.start) + lines.join("\n") + config.slice(bounds.end);
}

export function removeSubscription(config: string, name: string): string {
	const bounds = sectionBounds(config);
	if (!bounds) throw new Error(`Subscription ${name} is not in the config.`);
	const body = config.slice(bounds.start, bounds.end);
	const out: string[] = [];
	let found = false;
	let skipping = false;
	for (const line of body.split("\n")) {
		const provider = line.match(/^  ([a-z0-9][a-z0-9_-]*):[ \t]*$/);
		if (provider) {
			skipping = (provider[1] ?? "") === name;
			if (skipping) {
				found = true;
				continue;
			}
		}
		if (skipping) {
			if (/^[^ \t]/.test(line)) skipping = false;
			else continue;
		}
		out.push(line);
	}
	if (!found) throw new Error(`Subscription ${name} is not in the config.`);
	const kept = out.join("\n");
	const rebuilt = body.endsWith("\n") && !kept.endsWith("\n") ? `${kept}\n` : kept;
	return removeFromGroups(config.slice(0, bounds.start) + rebuilt + config.slice(bounds.end), name);
}
