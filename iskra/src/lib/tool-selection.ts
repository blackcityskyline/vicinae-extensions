import { LocalStorage } from "@vicinae/api";
import { pickBackend } from "../backends";
import { ALL_ANNOTATORS, getAnnotator } from "../annotators";
import { fullOrder } from "./order";
import type { CaptureBackend, CaptureMode } from "../backends/types";
import type { AnnotatorBackend } from "../annotators/types";
import type { Preferences } from "./preferences";

const CAPTURE_KEY = "active_capture_tool";
const ANNOTATE_KEY = "active_annotation_tool";

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
	// A saved tool that is gone, cannot run here, or cannot serve `mode` is a
	// starting point, not an answer: the order decides.
	return pickBackend(
		saved ?? prefs.screenshot_tool ?? "auto",
		prefs.capture_order ?? "",
		mode,
	);
};

/** The order a fallback walks: see `fullOrder`. `none` is not an annotator id, so it never appears. */
export const annotatorOrder = (raw: string): string[] =>
	fullOrder(
		raw,
		ALL_ANNOTATORS.map((a) => a.id),
	);

/**
 * First annotator that can actually run, or null when there is none to run.
 * `preferredId` is the choice made in the picker or the preference; when it is
 * gone (uninstalled, Noctalia stopped, a layout that is not there) the
 * configured order decides, not a fixed list. `none` is a decision, not a
 * fallback: it disables annotation, so it stops the chain with null.
 */
export const pickAnnotator = (
	prefs: Pick<Preferences, "annotation_tool" | "annotation_order">,
	preferredId: string | null = null,
): AnnotatorBackend | null => {
	const preferred = (preferredId ?? prefs.annotation_tool ?? "auto")
		.trim()
		.toLowerCase();
	if (preferred === "none") return null;

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
