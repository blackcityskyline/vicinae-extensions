import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { runReveal } from "../lib/focus";
import { run } from "../backends/utils";

interface PreviewDetailProps {
	imagePath: string;
	suggestedName: string;
	subfolder: string;
	annotatorLabel: string | null;
	onCopy: () => void;
	onAnnotate: () => void;
	onRefreshPreview: () => void;
	onReshoot: () => void;
	onDiscard: () => void;
}

export function PreviewDetail({
	imagePath,
	suggestedName,
	subfolder,
	annotatorLabel,
	onCopy,
	onAnnotate,
	onRefreshPreview,
	onReshoot,
	onDiscard,
}: PreviewDetailProps) {
	let dimensions = "unknown";
	try {
		dimensions = run("identify", ["-format", "%wx%h", imagePath]);
	} catch {
		// imagemagick not installed - skip
	}

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
						{annotatorLabel && (
						<Action
							title={annotatorLabel}
							icon={Icon.Pencil}
							shortcut={{ modifiers: [], key: "enter" }}
							onAction={onAnnotate}
						/>
						)}
						<Action
							title="Show in File Manager"
							icon={Icon.Finder}
							shortcut={{ modifiers: ["shift"], key: "enter" }}
							onAction={() => runReveal(imagePath)}
						/>
					</ActionPanel.Section>
					<ActionPanel.Section title="Other Options">
						<Action
							title="Refresh Preview"
							icon={Icon.ArrowClockwise}
							shortcut={{ modifiers: ["ctrl"], key: "r" }}
							onAction={onRefreshPreview}
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
						text={`${suggestedName}.png`}
					/>
					<Detail.Metadata.Label title="Dimensions" text={dimensions} />
					<Detail.Metadata.Separator />
					<Detail.Metadata.Label title="Folder" text={subfolder} />
				</Detail.Metadata>
			}
		/>
	);
}
