export function formatDelay(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
	const value = Math.round(ms);
	if (value < 1) return "—";
	return `${value} ms`;
}

export function formatBytes(bytes: number | null | undefined): string {
	if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	const shown = unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1);
	return `${shown} ${units[unit] ?? "B"}`;
}

export function formatDuration(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
	const total = Math.floor(seconds);
	if (total < 60) return `${total} s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes} m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} h ${minutes % 60} m`;
	return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function formatDate(epochSeconds: number | null | undefined): string {
	if (!epochSeconds) return "—";
	const date = new Date(epochSeconds * 1000);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

export function formatClock(iso: string | null | undefined): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
