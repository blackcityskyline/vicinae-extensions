import { useState } from "react";
import {
	Action,
	ActionPanel,
	Form,
	Icon,
	Keyboard,
	closeMainWindow,
	showToast,
} from "@vicinae/api";
import { copyTextToClipboard } from "../lib/clipboard";

/** What a scan found, editable before it is copied. */
export function ScanResult({
	text,
	title,
}: {
	text: string;
	title: string;
}) {
	const [value, setValue] = useState(text);

	const copy = async (close: boolean) => {
		if (!(await copyTextToClipboard(value))) return;
		if (close) await closeMainWindow();
		else showToast({ title: "Copied to clipboard" });
	};

	return (
		<Form
			actions={
				<ActionPanel>
					<Action
						title="Copy and Close"
						icon={Icon.CopyClipboard}
						shortcut={{ modifiers: ["ctrl"], key: "enter" }}
						onAction={() => copy(true)}
					/>
					<Action
						title="Copy to Clipboard"
						icon={Icon.CopyClipboard}
						shortcut={Keyboard.Shortcut.Common.Copy}
						onAction={() => copy(false)}
					/>
				</ActionPanel>
			}
		>
			<Form.TextArea id="result" title={title} value={value} onChange={setValue} />
		</Form>
	);
}
