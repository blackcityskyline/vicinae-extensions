import { join } from "node:path";

/** `YYYY-MM-DD` in local time, the folder name for one day's list. */
export const dayFolder = (now: Date): string => {
	const month = `${now.getMonth() + 1}`.padStart(2, "0");
	const day = `${now.getDate()}`.padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
};

export const todoFileFor = (now: Date, home: string): string =>
	join(home, "Documents", "todo", dayFolder(now), "todo.json");
