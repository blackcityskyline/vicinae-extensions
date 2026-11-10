export type Row = { label: string; value: string };
export type Spec = { user: string; facts: Row[]; summary: string };

export type FastfetchModule = { type?: unknown; result?: unknown };

type Bag = Record<string, unknown>;

const record = (value: unknown): Bag | undefined =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Bag) : undefined;

const text = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const number = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const join = (parts: (string | undefined)[], separator = " "): string | undefined => {
	const kept = parts.filter((part): part is string => part !== undefined && part !== "");
	return kept.length > 0 ? kept.join(separator) : undefined;
};

const read = (modules: readonly FastfetchModule[], type: string): unknown =>
	modules.find((module) => module.type === type)?.result;

/** fastfetch reports uptime in milliseconds; the pane has room for two units. */
function uptime(ms: number | undefined): string | undefined {
	if (ms === undefined) return undefined;
	const hours = Math.floor(ms / 3_600_000);
	const days = Math.floor(hours / 24);
	return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

const PACKAGE_MANAGERS = ["pacman", "dpkg", "rpm", "flatpak", "snap"];

function packageManager(packages: Bag | undefined): string | undefined {
	return PACKAGE_MANAGERS.find((manager) => number(packages?.[manager]) !== undefined);
}

/** The lines the right column shows, in the order fastfetch prints them. */
export type SpecOptions = {
	osAgeDays?: number;
	launcher?: string;
	/** The shell that draws the desktop, when one is running. */
	shell?: string;
};

export function buildSpec(modules: readonly FastfetchModule[], options: SpecOptions = {}): Spec {
	const { osAgeDays, launcher, shell } = options;
	const title = record(read(modules, "Title"));
	const os = record(read(modules, "OS"));
	const kernel = record(read(modules, "Kernel"));
	const wm = record(read(modules, "WM"));
	const de = record(read(modules, "DE"));
	const packages = record(read(modules, "Packages"));
	const uptimeModule = record(read(modules, "Uptime"));
	const font = record(read(modules, "Font"));

	const userName = text(title?.userName);
	const hostName = text(title?.hostName);
	const user = userName && hostName ? `${userName}@${hostName}` : (userName ?? hostName ?? "This machine");

	const facts: Row[] = [];

	const osName = join([text(os?.prettyName) ?? text(os?.name), text(os?.version)]);
	if (osName) facts.push({ label: "OS", value: osName });

	const kernelRelease = text(kernel?.release);
	if (kernelRelease) facts.push({ label: "Kernel", value: kernelRelease });

	const desktop = text(de?.prettyName);
	const windowManager = join([text(wm?.prettyName), text(wm?.version)]);
	const wmLine = desktop ? join([desktop, text(de?.version)]) : windowManager;
	if (wmLine) facts.push({ label: "WM/DE", value: wmLine });

	const packageCount = number(packages?.all);
	const manager = packageManager(packages);
	if (packageCount !== undefined) {
		facts.push({ label: "Packages", value: manager ? `${packageCount} (${manager})` : `${packageCount}` });
	}

	if (shell) facts.push({ label: "Shell", value: shell });

	if (osAgeDays !== undefined) facts.push({ label: "OS age", value: `${osAgeDays} ${osAgeDays === 1 ? "day" : "days"}` });

	const uptimeLine = uptime(number(uptimeModule?.uptime));
	if (uptimeLine) facts.push({ label: "Uptime", value: uptimeLine });

	if (launcher) facts.push({ label: "Vicinae", value: launcher });

	const firstFont = Array.isArray(font?.fonts) ? text(font?.fonts[0]) : undefined;
	if (firstFont) facts.push({ label: "Font", value: firstFont.replace(/\s*\[[^\]]*\]$/, "") });

	const summary = [user, ...facts.map((fact) => `${fact.label}: ${fact.value}`)].join("\n");
	return { user, facts, summary };
}
