import { readFile } from "node:fs/promises";

import { parseProcNetDev, parseSockets, type AppTraffic, type DevSample } from "~/utils/parse.ts";
import { run } from "./exec.ts";

export async function readDevSample(
	scope: "primary" | "all",
	primaryIface: string,
): Promise<DevSample | null> {
	try {
		return parseProcNetDev(await readFile("/proc/net/dev", "utf8"), scope, primaryIface);
	} catch {
		return null;
	}
}

export async function readAppTraffic(): Promise<AppTraffic[]> {
	// `-e` prints the socket's cgroup, which is the only way to attribute a
	// socket owned by another user — a root daemon has no readable /proc/<pid>.
	const result = await run("ss", ["-tinpe", "state", "established"], 5000);
	return result.ok ? parseSockets(result.stdout) : [];
}