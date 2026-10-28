import { fullOrder, namedOrder } from "../lib/order";
import { flameshotBackend } from "./flameshot";
import { gnomeScreenshotBackend } from "./gnome-screenshot";
import { grimBackend } from "./grim";
import { grimblastBackend } from "./grimblast";
import { maimBackend } from "./maim";
import { noctaliaBackend } from "./noctalia";
import { screencaptureBackend } from "./screencapture";
import { screenshotDesktopBackend } from "./screenshot-desktop";
import { spectacleBackend } from "./spectacle";
import type { CaptureBackend, CaptureMode, Session } from "./types";
import { x11ScrotBackend } from "./x11-scrot";

export type { CaptureBackend, CaptureMode } from "./types";

// Priority order for auto-detection - screenshot-desktop last (native tools preferred)
export const ALL_BACKENDS: CaptureBackend[] = [
	grimblastBackend,
	grimBackend,
	spectacleBackend,
	gnomeScreenshotBackend,
	flameshotBackend,
	maimBackend,
	x11ScrotBackend,
	screencaptureBackend,
	noctaliaBackend,
	screenshotDesktopBackend,
];

const BACKEND_IDS = ALL_BACKENDS.map((b) => b.id);

export const detectSession = (): Session => {
	if (process.platform === "darwin") return "darwin";
	if (process.platform === "win32") return "win32";
	if (process.env.XDG_SESSION_TYPE === "x11") return "x11";
	if (!process.env.WAYLAND_DISPLAY && process.env.DISPLAY) return "x11";
	return "wayland";
};

const isWlrootsCompositor = (): boolean => {
	if (
		process.env.HYPRLAND_INSTANCE_SIGNATURE ||
		process.env.SWAYSOCK ||
		process.env.NIRI_SOCKET
	) {
		return true;
	}
	const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
	return ["hyprland", "sway", "niri", "river", "wlroots", "labwc"].some((c) =>
		desktop.includes(c),
	);
};

/**
 * Desktops that ship their own capture tool: preferring it avoids falling
 * through to a generic tool that the session's compositor cannot drive.
 */
const preferredBackendForDesktop = (): string | null => {
	const desktop = (process.env.XDG_CURRENT_DESKTOP ?? "").toLowerCase();
	if (desktop.includes("kde") || desktop.includes("plasma")) return "spectacle";
	if (desktop.includes("gnome")) return "gnome-screenshot";
	return null;
};

/** Whether this backend can run here, for `mode` when one is given. */
const isUsable = (backend: CaptureBackend, mode?: CaptureMode): boolean => {
	const session = detectSession();
	if (!backend.sessions.includes(session)) return false;
	if (session === "wayland" && backend.wlrootsOnly && !isWlrootsCompositor()) {
		return false;
	}
	return (
		(mode === undefined || backend.supportedModes.includes(mode)) &&
		backend.isAvailable()
	);
};

/** Backends that can run in this session, in built-in priority order. */
export const getUsableBackends = (): CaptureBackend[] =>
	ALL_BACKENDS.filter((b) => isUsable(b));

/** The full fallback chain for a capture-order preference. */
export const captureOrder = (raw: string): string[] => fullOrder(raw, BACKEND_IDS);

export const findBackend = (id: string): CaptureBackend | undefined =>
	ALL_BACKENDS.find((b) => b.id === id);

const autoDetect = (rawOrder: string, mode?: CaptureMode): CaptureBackend | null => {
	// An explicit order is a decision: walk it before anything else, and do not
	// let a desktop preference reorder a list the user wrote by hand.
	if (namedOrder(rawOrder, BACKEND_IDS).length > 0) {
		for (const id of captureOrder(rawOrder)) {
			const backend = findBackend(id);
			if (backend && isUsable(backend, mode)) return backend;
		}
		return null;
	}

	const eligible = ALL_BACKENDS.filter((b) => isUsable(b, mode));
	const preferred = preferredBackendForDesktop();
	return eligible.find((b) => b.id === preferred) ?? eligible[0] ?? null;
};

/**
 * Resolves a backend that can actually serve `mode`. A configured tool that
 * cannot run here, or does not support the requested mode, falls back to the
 * configured order (or auto-detection) rather than failing at capture time.
 * `id` may be "auto" or an id that names no backend; both go straight to the
 * fallback.
 */
export const pickBackend = (
	id: string,
	rawOrder = "",
	mode?: CaptureMode,
): CaptureBackend | null => {
	const chosen = findBackend(id);
	if (chosen && isUsable(chosen, mode)) return chosen;
	return autoDetect(rawOrder, mode);
};
