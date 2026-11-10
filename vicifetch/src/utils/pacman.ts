const INSTALL_DATE = /%INSTALLDATE%\s*\n\s*(\d+)/;

/** pacman's `desc` stores the install epoch on the line after `%INSTALLDATE%`. */
export function parseInstallDate(desc: string): number | undefined {
	const match = INSTALL_DATE.exec(desc);
	if (!match) return undefined;
	const epoch = Number(match[1]);
	return Number.isSafeInteger(epoch) && epoch > 0 ? epoch : undefined;
}

/** Same arithmetic as `~/bin/fetchs/fetch1`: whole days since the epoch, never negative. */
export function ageInDays(installedAtSeconds: number, nowMilliseconds = Date.now()): number {
	return Math.max(0, Math.floor((nowMilliseconds / 1000 - installedAtSeconds) / 86_400));
}
