import { Action, Clipboard, Icon } from "@vicinae/api";

// Action.CopyToClipboard does not await the copy before closing the window, so
// the worker dies mid-transfer and nothing lands. vim-bro's awaited copy is the
// shape measured to work on Vicinae 0.29.2.
export function CopyAction({ title, content, shortcut }: { title: string; content: string; shortcut?: string }) {
	return (
		<Action
			title={title}
			icon={Icon.CopyClipboard}
			shortcut={shortcut}
			onAction={async () => {
				await Clipboard.copy(content);
			}}
		/>
	);
}