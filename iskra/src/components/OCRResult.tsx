import React from "react";
import { Action, ActionPanel, Form, Icon, Keyboard, showHUD } from "@vicinae/api";
import { Clipboard } from "@vicinae/api";

export function OCRResult({
	text,
	onClose,
	title = "OCR Result",
	placeholder = "No text detected",
}: {
	text: string;
	onClose?: () => void;
	title?: string;
	placeholder?: string;
}) {
	const [editedText, setEditedText] = React.useState(text);

	const handleCopy = async () => {
		await Clipboard.copy(editedText);
		await showHUD("Copied to clipboard");
	};

	return (
		<Form
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Copy & Close"
						icon={Icon.CopyClipboard}
						shortcut={{ modifiers: ["ctrl"], key: "enter" }}
						onSubmit={(values) => {
							const typed = (values as { result?: unknown }).result;
							if (typeof typed === "string") {
								setEditedText(typed);
								Clipboard.copy(typed);
								showHUD("Copied to clipboard");
								if (onClose) onClose();
							}
						}}
					/>
					<Action
						title="Copy to Clipboard"
						icon={Icon.CopyClipboard}
						shortcut={Keyboard.Shortcut.Common.CopyName}
						onAction={handleCopy}
					/>
					<Action
						title="Close"
						icon={Icon.Xmark}
						shortcut={{ modifiers: [], key: "escape" }}
						onAction={onClose ?? (() => {})}
					/>
				</ActionPanel>
			}
		>
			<Form.TextArea
				id="result"
				title={title}
				value={editedText}
				onChange={setEditedText}
				placeholder={placeholder}
			/>
		</Form>
	);
}
