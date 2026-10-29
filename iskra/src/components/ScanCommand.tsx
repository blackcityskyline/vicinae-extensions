import { useEffect, useState } from "react";
import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { captureScreenshot } from "../lib/capture";
import { copyTextToClipboard } from "../lib/clipboard";
import { removeTempCapture } from "../lib/filesystem";
import { ScanError } from "../lib/scan";
import { resolveBackend } from "../lib/tool-selection";
import { getPrefs } from "../lib/preferences";
import { ScanResult } from "./ScanResult";

type State =
	| { kind: "scanning" }
	/** The selection was dismissed, or the capture tool failed (and said so itself). */
	| { kind: "cancelled" }
	| { kind: "nothing" }
	| { kind: "error"; message: string; installCommand: string | null }
	| { kind: "found"; text: string };

interface ScanCommandProps {
	/** Reads what is in the captured image; empty when there is nothing. */
	scan: (imagePath: string) => Promise<string>;
	/** Title of the result field, and what the command says when it finds nothing. */
	resultTitle: string;
	nothingFound: string;
}

/** Captures a screen region, scans it, and shows what was found. */
export function ScanCommand({ scan, resultTitle, nothingFound }: ScanCommandProps) {
	const [state, setState] = useState<State>({ kind: "scanning" });

	useEffect(() => {
		(async () => {
			try {
				const backend = await resolveBackend(getPrefs(), "area");
				if (!backend) {
					setState({
						kind: "error",
						message:
							'No screenshot tool can capture "area" here. Open Manage Tools to see what to install.',
						installCommand: null,
					});
					return;
				}
				// A scan reads the file itself, so it always wants the temporary one,
				// even when the capture hand-off preference sends screenshots elsewhere.
				const image = await captureScreenshot(backend, "area", { native: false });
				if (!image) {
					setState({ kind: "cancelled" });
					return;
				}
				const text = await scan(image);
				setState(text ? { kind: "found", text } : { kind: "nothing" });
			} catch (e) {
				console.error("Scan failed", e);
				setState({
					kind: "error",
					message: (e as Error).message,
					installCommand: e instanceof ScanError ? e.installCommand : null,
				});
			} finally {
				removeTempCapture();
			}
		})();
	}, []);

	switch (state.kind) {
		case "found":
			return <ScanResult text={state.text} title={resultTitle} />;
		case "scanning":
			return <Detail isLoading markdown="## Select the region to scan" />;
		case "cancelled":
			return (
				<Detail markdown="## Nothing scanned\n\nThe selection was cancelled, or the capture tool reported an error." />
			);
		case "nothing":
			return <Detail markdown={`## ${nothingFound}`} />;
		case "error": {
			const { installCommand } = state;
			return (
				<Detail
					markdown={`## Scan failed\n\n${state.message}${installCommand ? `\n\n\`${installCommand}\`` : ""}`}
					actions={
						installCommand ? (
							<ActionPanel>
								<Action
									title="Copy Install Command"
									icon={Icon.CopyClipboard}
									onAction={() => copyTextToClipboard(installCommand)}
								/>
							</ActionPanel>
						) : undefined
					}
				/>
			);
		}
	}
}
