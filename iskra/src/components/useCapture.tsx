import { useRef, useState, type ReactElement } from "react";
import { Detail, showHUD } from "@vicinae/api";
import type { CaptureBackend, CaptureMode } from "../backends/types";
import { type CaptureRequest, captureScreenshot } from "../lib/capture";
import { deliverCapture } from "../lib/deliver";
import { removeTempCapture } from "../lib/filesystem";
import { getPrefs } from "../lib/preferences";
import { resolveBackend } from "../lib/tool-selection";
import { CapturePreview } from "./CapturePreview";

type Phase =
	| { kind: "idle" }
	| { kind: "capturing" }
	/** Cancelled, or the capture tool reported an error. */
	| { kind: "failed" }
	/** The desktop tool saved it directly: no preview, but iskra still copied. */
	| { kind: "native"; path: string }
	/** The backend owned the whole capture: it saved, copied and notified itself. */
	| { kind: "handoff"; path?: string }
	| { kind: "preview"; path: string }
	| { kind: "discarded" }
	/** Autoclose: the launcher is gone. */
	| { kind: "closed" };

interface UseCaptureOptions {
	/**
	 * What Reshoot does once the preview is gone. By default the last capture is
	 * repeated; a command with its own picker shows that again instead.
	 */
	onReshoot?: () => void;
}

/**
 * One capture, from the tool to the preview. `run` takes the screenshot and
 * hands it to `deliverCapture`; `view` is the preview (or the "saved" message in
 * native hand-off) once there is one. In every other phase `view` is null and
 * the command shows its own picker or progress.
 */
export function useCapture({ onReshoot }: UseCaptureOptions = {}) {
	const [phase, setPhase] = useState<Phase>({ kind: "idle" });
	const last = useRef<() => Promise<void>>(async () => {});

	/**
	 * `backend` undefined resolves one for `mode`; null is a caller that already
	 * looked and found none.
	 */
	const run = async (
		mode: CaptureMode,
		target: CaptureRequest = {},
		backend?: CaptureBackend | null,
	): Promise<void> => {
		last.current = () => run(mode, target, backend);
		setPhase({ kind: "capturing" });
		try {
			const prefs = getPrefs();
			const chosen =
				backend === undefined ? await resolveBackend(prefs, mode) : backend;
			if (!chosen) {
				showHUD(
					`No screenshot tool can capture "${mode}" here. Open Manage Tools to see what to install.`,
				);
				setPhase({ kind: "failed" });
				return;
			}
			const captured = await captureScreenshot(chosen, mode, target);
			if (!captured) {
				setPhase({ kind: "failed" });
				return;
			}
			// The backend drew its own overlay and kept the file: saving, copying
			// and notifying a second time would duplicate everything it did.
			if (captured.kind === "handoff") {
				setPhase({ kind: "handoff", ...(captured.path ? { path: captured.path } : {}) });
				return;
			}
			const delivery = await deliverCapture(captured.path, prefs);
			setPhase(delivery.kind === "closed" ? { kind: "closed" } : delivery);
		} catch (e) {
			console.error("Capture failed", e);
			showHUD(`Could not finish the capture: ${(e as Error).message}`);
			setPhase({ kind: "failed" });
		}
	};

	const view: ReactElement | null =
		phase.kind === "preview" ? (
			<CapturePreview
				imagePath={phase.path}
				onReshoot={() => {
					setPhase({ kind: "idle" });
					(onReshoot ?? last.current)();
				}}
				onDiscard={() => {
					removeTempCapture();
					setPhase({ kind: "discarded" });
				}}
			/>
		) : phase.kind === "native" ? (
			<Detail markdown={`## Screenshot saved\n\n\`${phase.path}\``} />
		) : phase.kind === "handoff" ? (
			<Detail
				markdown={
					(phase.path ? `## Screenshot saved\n\n\`${phase.path}\`\n\n` : "## Screenshot captured\n\n") +
					"The capture tool saved and copied it itself, so Copy, Save and Annotate do not apply here."
				}
			/>
		) : null;

	return { phase: phase.kind, run, view };
}
