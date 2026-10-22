import { LocalStorage } from "@vicinae/api";
import { ALL_BACKENDS, getBackend, getBackendForMode } from "../backends";
import { ALL_ANNOTATORS, getAnnotator } from "../annotators";
import type { CaptureBackend, CaptureMode } from "../backends/types";
import type { AnnotatorBackend } from "../annotators/types";
import type { Preferences } from "./preferences";

const CAPTURE_KEY = "active_capture_tool";
const ANNOTATE_KEY = "active_annotation_tool";

export const getInstalledBackends = (): CaptureBackend[] =>
	ALL_BACKENDS.filter((b) => b.isAvailable());

export const getInstalledAnnotators = (): AnnotatorBackend[] =>
	ALL_ANNOTATORS.filter((a) => a.isAvailable());

/**
 * Resolves the active backend: LocalStorage → preference → configured order.
 * A tool that cannot run here falls through the same chain as an unset choice.
 */
export const resolveBackend = async (
	prefs: Preferences,
	mode?: CaptureMode,
): Promise<CaptureBackend | null> => {
	const saved = await LocalStorage.getItem<string>(CAPTURE_KEY);
	const id = saved ?? prefs.screenshot_tool ?? "auto";
	const order = prefs.capture_order ?? "";
	// A command that knows its mode needs a backend that supports that mode in
	// this session, not merely the globally configured one.
	if (mode !== undefined) return getBackendForMode(id, mode, order);
	const backend = getBackend(id, order);
	// If the saved tool is no longer installed, fall back to the configured order
	if (backend && !backend.isAvailable()) return getBackend("auto", order);
	return backend;
};

/**
 * The order a fallback walks: the ids the user listed, then every remaining
 * annotator in the built-in order. A new annotator is reachable without editing
 * the preference, and an unknown or misspelled id is skipped rather than
 * disabling the chain.
 */
export const annotatorOrder = (raw: string): string[] => {
	const configured = raw
		.split(/[\s,>]+/)
		.map((id) => id.trim().toLowerCase())
		.filter((id) => id.length > 0 && id !== "none");

	const chain = [...new Set(configured)].filter((id) => getAnnotator(id) !== null);
	for (const annotator of ALL_ANNOTATORS) {
		if (!chain.includes(annotator.id)) chain.push(annotator.id);
	}
	return chain;
};

/**
 * First annotator that can actually run. `preferredId` is the choice made in the
 * picker or the preference; when it is gone (uninstalled, Noctalia stopped, a
 * layout that is not there) the configured order decides, not a fixed list.
 * `none` is a decision, not a fallback: it disables annotation.
 */
export const pickAnnotator = (
	prefs: Pick<Preferences, "annotation_tool" | "annotation_order">,
	preferredId: string | null = null,
): AnnotatorBackend | null => {
	const preferred = (preferredId ?? prefs.annotation_tool ?? "auto")
		.trim()
		.toLowerCase();
	if (preferred === "none") return getAnnotator("none");

	const chain = annotatorOrder(prefs.annotation_order ?? "");
	const candidates = preferred === "auto" ? chain : [preferred, ...chain];

	for (const id of candidates) {
		const annotator = getAnnotator(id);
		if (annotator && annotator.isAvailable()) return annotator;
	}
	return null;
};

/** Resolves the active annotator: LocalStorage → preference → configured order. */
export const resolveAnnotator = async (
	prefs: Preferences,
): Promise<AnnotatorBackend | null> => {
	const saved = await LocalStorage.getItem<string>(ANNOTATE_KEY);
	return pickAnnotator(prefs, saved);
};

export const saveBackendChoice = (id: string): Promise<void> =>
	LocalStorage.setItem(CAPTURE_KEY, id);

export const saveAnnotatorChoice = (id: string): Promise<void> =>
	LocalStorage.setItem(ANNOTATE_KEY, id);
