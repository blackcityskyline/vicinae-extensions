import { Action, ActionPanel } from "@vicinae/api";

import { useAvailableLanguages } from "~/hooks/usePageData";
import { languages, type Locale } from "~/utils/language";

/**
 * A submenu is opened by the user, so it starts empty while the translations load
 * rather than offering a row that does nothing.
 */
export function ChangeLanguageSubmenu({
	title,
	language,
	onSelect,
}: {
	title: string;
	language: Locale;
	onSelect: (title: string, language: Locale) => void;
}) {
	const { data: availableLanguages } = useAvailableLanguages(title, language);
	const current = languages.find((entry) => entry.value === language);

	return (
		<ActionPanel.Submenu shortcut={{ modifiers: ["ctrl", "shift"], key: "l" }} title="Change Language" icon={current?.icon}>
			{languages
				.filter((entry) => entry.value !== language)
				.map((entry) => {
					const translatedTitle = availableLanguages?.find(({ lang }) => lang === entry.value)?.title;
					if (!translatedTitle) return null;

					return (
						<Action
							key={entry.value}
							icon={entry.icon}
							title={entry.title}
							onAction={() => onSelect(translatedTitle, entry.value)}
						/>
					);
				})}
		</ActionPanel.Submenu>
	);
}
