import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { knownShell, layerOwner, shellName, type Process } from "../utils/desktop-shell";

/** `/proc/<pid>/stat`: `pid (comm) state ppid …`; `comm` may contain spaces and `)`. */
function readProcesses(): Process[] {
	const processes: Process[] = [];

	for (const entry of readdirSync("/proc")) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
			const open = stat.indexOf("(");
			const close = stat.lastIndexOf(")");
			processes.push({
				pid: Number(entry),
				ppid: Number(stat.slice(close + 2).split(" ")[1]),
				comm: stat.slice(open + 1, close),
			});
		} catch {
			// A process that exited while the tree was being read.
		}
	}

	return processes;
}

/**
 * The shell that draws the desktop. Hyprland is asked which process owns its
 * layer surfaces, so a different shell is named without any list; other
 * compositors fall back to matching a known shell process.
 */
export function readDesktopShell(): string | undefined {
	const processes = readProcesses();

	try {
		const owner = layerOwner(
			JSON.parse(execFileSync("hyprctl", ["layers", "-j"], { timeout: 1000, encoding: "utf8" })),
		);
		const name = owner === undefined ? undefined : shellName(processes, owner);
		if (name) return name;
	} catch {
		// Not Hyprland, or no Hyprland socket.
	}

	return knownShell(processes);
}
