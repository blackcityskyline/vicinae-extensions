import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FastfetchModule } from "../utils/spec";
import { parseOsRelease } from "../utils/os-release";

export type FastfetchResult =
	| { ok: true; modules: FastfetchModule[] }
	| { ok: false; reason: "missing" | "failed"; message: string };

const MODULES = [
	"title",
	"os",
	"kernel",
	"wm",
	"de",
	"packages",
	"uptime",
	"font",
	"logo",
];

/** `/etc/os-release`'s ID asks fastfetch for the large logo; the bare module picks the 7-line one. */
function distroId(): string | undefined {
	try {
		return parseOsRelease(readFileSync("/etc/os-release", "utf8")).ID;
	} catch {
		return undefined;
	}
}

export async function readSystemInfo(): Promise<FastfetchResult> {
	return new Promise((resolve) => {
		const id = distroId();
		execFile(
			"fastfetch",
			["--json", "--structure", MODULES.join(":"), ...(id ? ["--logo", id] : [])],
			{ timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
			(error, stdout) => {
				if (error) {
					const code = (error as NodeJS.ErrnoException).code;
					resolve(
						code === "ENOENT"
							? { ok: false, reason: "missing", message: "fastfetch is not installed." }
							: { ok: false, reason: "failed", message: error.message },
					);
					return;
				}
				try {
					const parsed: unknown = JSON.parse(stdout);
					const modules = Array.isArray(parsed)
						? parsed.filter(
								(entry): entry is FastfetchModule =>
									typeof entry === "object" && entry !== null && "type" in entry,
							)
						: [];
					resolve({ ok: true, modules });
				} catch (parseError) {
					resolve({
						ok: false,
						reason: "failed",
						message: parseError instanceof Error ? parseError.message : "fastfetch returned invalid JSON.",
					});
				}
			},
		);
	});
}

const LOGO_DIRECTORIES = [
	"/usr/share/pixmaps",
	"/usr/share/icons/hicolor/scalable/apps",
	"/usr/share/icons/hicolor/256x256/apps",
];

/** `/etc/os-release` names the logo (`LOGO=archlinux-logo`); the file is found by trying the icon paths. */
export function readDistroLogo(): string | undefined {
	let values: Record<string, string> = {};
	try {
		values = parseOsRelease(readFileSync("/etc/os-release", "utf8"));
	} catch {
		return undefined;
	}

	const id = values.ID;
	const names = [values.LOGO, id ? `${id}-logo` : undefined, id].filter(
		(name): name is string => name !== undefined && name !== "",
	);

	for (const name of names) {
		for (const directory of LOGO_DIRECTORIES) {
			for (const extension of [".png", ".svg"]) {
				const candidate = join(directory, `${name}${extension}`);
				if (existsSync(candidate)) return pathToFileURL(candidate).href;
			}
		}
	}
	return undefined;
}

