import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ageInDays, parseInstallDate } from "../utils/pacman";

const PACMAN_LOCAL = "/var/lib/pacman/local";

/** The `filesystem` package's install date is the closest thing Arch has to an OS install date. */
export function readOsAgeDays(nowMilliseconds = Date.now()): number | undefined {
	try {
		const packageDirectory = readdirSync(PACMAN_LOCAL).find((entry) => entry.startsWith("filesystem-"));
		if (!packageDirectory) return undefined;
		const installedAt = parseInstallDate(readFileSync(join(PACMAN_LOCAL, packageDirectory, "desc"), "utf8"));
		return installedAt === undefined ? undefined : ageInDays(installedAt, nowMilliseconds);
	} catch {
		return undefined;
	}
}
