import { useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, showHUD } from "@vicinae/api";
import { OCR_LANGUAGES, getOcrLanguage, saveOcrLanguage } from "./lib/ocr-language";

export default function SelectOcrLanguage() {
	// null until the saved choice has been read, so no row is marked wrongly.
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		getOcrLanguage().then(setSelected);
	}, []);

	const select = async (code: string, name: string) => {
		try {
			await saveOcrLanguage(code);
		} catch (e) {
			await showHUD(`Failed to save language: ${(e as Error).message}`);
			return;
		}
		setSelected(code);
		await showHUD(`OCR language set to ${name}`);
	};

	return (
		<List isLoading={selected === null} searchBarPlaceholder="Search languages...">
			<List.Section title="Supported Languages">
				{OCR_LANGUAGES.map(({ code, name }) => (
					<List.Item
						key={code}
						icon={code === selected ? Icon.CheckCircle : Icon.Circle}
						title={name}
						subtitle={code}
						keywords={[code]}
						actions={
							<ActionPanel>
								<Action title="Select Language" onAction={() => select(code, name)} />
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}
