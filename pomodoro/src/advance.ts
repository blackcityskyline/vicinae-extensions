import { finishExpired } from "./api/session.ts";

// Scheduled by `src/api/schedule.ts` when a phase starts. It only ever ends a
// phase whose deadline has passed, so a late or repeated launch is harmless.
export default async function Advance() {
	await finishExpired();
}
