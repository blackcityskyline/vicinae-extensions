import { useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { annotateFile } from "../lib/annotate";
import { copyToClipboard } from "../lib/clipboard";
import { formatDateTokens } from "../lib/dateFormat";
import { runReveal } from "../lib/focus";
import { pngSize } from "../lib/png";
import { getPrefs } from "../lib/preferences";
import { resolveAnnotator } from "../lib/tool-selection";

interface CapturePreviewProps {
	imagePath: string;
	onReshoot: () => void;
	onDiscard: () => void;
}

export function CapturePreview({
	imagePath,
	onReshoot,
	onDiscard,
}: CapturePreviewProps) {
	const prefs = getPrefs();
	const [annotatorName, setAnnotatorName] = useState<string | null>(null);
	const [reloading, setReloading] = useState(false);

	useEffect(() => {
		resolveAnnotator(prefs).then((a) => setAnnotatorName(a?.displayName ?? null));
	}, []);

	// The renderer keeps what it already drew for a path, so a reload is the
	// preview going away and coming back, which mounts it with a fresh cache-buster.
	const reload = () => {
		setReloading(true);
		setTimeout(() => setReloading(false), 100);
	};

	const annotate = async () => {
		if (await annotateFile(imagePath)) reload();
	};

	const size = useMemo(() => pngSize(imagePath), [imagePath]);

	if (reloading) return <Detail isLoading markdown="" />;

	return (
		<Detail
			// A query string appended to a filesystem path is not cache-busting: the
			// renderer looks for a file literally named "capture.png?1234" and shows a
			// broken image. Use a file:// URI and carry the cache-buster in the
			// fragment, which is not part of the path.
			markdown={`![Preview](file://${imagePath}#${Date.now()})`}
			navigationTitle="Screenshot Preview"
			actions={
				<ActionPanel>
					<ActionPanel.Section title="Primary Actions">
						{annotatorName && (
							<Action
								title={`Annotate (${annotatorName})`}
								icon={Icon.Pencil}
								shortcut={{ modifiers: [], key: "enter" }}
								onAction={annotate}
							/>
						)}
						<Action
							title="Show in File Manager"
							icon={Icon.Finder}
							shortcut={{ modifiers: ["shift"], key: "enter" }}
							onAction={() => runReveal(imagePath)}
						/>
						<Action
							title="Copy to Clipboard"
							icon={Icon.CopyClipboard}
							shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
							onAction={() => copyToClipboard(imagePath, prefs.autoclose_vicinae)}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section title="Other Options">
						<Action
							title="Refresh Preview"
							icon={Icon.ArrowClockwise}
							shortcut={{ modifiers: ["ctrl"], key: "r" }}
							onAction={reload}
						/>
						<Action
							title="Reshoot"
							icon={Icon.RotateAntiClockwise}
							shortcut={{ modifiers: ["ctrl"], key: "a" }}
							onAction={onReshoot}
						/>
						<Action
							title="Discard"
							icon={Icon.Trash}
							style={Action.Style.Destructive}
							shortcut={{ modifiers: ["ctrl"], key: "x" }}
							onAction={onDiscard}
						/>
					</ActionPanel.Section>
				</ActionPanel>
			}
			metadata={
				<Detail.Metadata>
					<Detail.Metadata.Label
						title="Suggested Name"
						text={`${formatDateTokens(prefs.filename_format)}.png`}
					/>
					<Detail.Metadata.Label
						title="Dimensions"
						text={size ? `${size.width}x${size.height}` : "unknown"}
					/>
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label
						title="Folder"
						text={
							prefs.subfolder_format
								? formatDateTokens(prefs.subfolder_format)
								: "Root"
						}
					/>
				</Detail.Metadata>
			}
		/>
	);
}
