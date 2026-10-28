import { useEffect } from "react";
import { Detail } from "@vicinae/api";
import type { CaptureMode } from "../backends/types";
import { useCapture } from "./useCapture";

/** A command that takes one capture of `mode` as soon as it opens. */
export function CaptureCommand({
	mode,
	hint,
}: {
	mode: CaptureMode;
	hint: string;
}) {
	const { phase, run, view } = useCapture();

	useEffect(() => {
		run(mode);
	}, []);

	if (view) return view;
	if (phase === "discarded") return <Detail markdown="## Screenshot discarded" />;
	if (phase === "failed") {
		return (
			<Detail
				markdown={
					"## No screenshot captured\n\nThe capture was cancelled, or the capture tool reported an error."
				}
			/>
		);
	}
	return <Detail markdown={`## Capturing...\n\n${hint}`} />;
}
