import { environment } from "@vicinae/api";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { emptyState, type State } from "../utils/state.ts";

// Vicinae gives every extension a support directory that survives builds and
// reinstalls; the timer has to outlive the worker that started it.
function statePath(): string {
	return join(environment.supportPath, "state.json");
}

export async function readState(): Promise<State> {
	try {
		const parsed: unknown = JSON.parse(await readFile(statePath(), "utf8"));
		if (!parsed || typeof parsed !== "object") return emptyState();
		return { ...emptyState(), ...(parsed as Partial<State>) };
	} catch {
		return emptyState();
	}
}

export async function writeState(state: State): Promise<void> {
	await mkdir(environment.supportPath, { recursive: true });
	await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}
