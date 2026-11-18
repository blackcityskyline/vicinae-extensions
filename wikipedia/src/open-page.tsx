import type { LaunchProps } from "@vicinae/api";

import { useLanguage } from "~/api/language";
import WikipediaPage from "~/components/wikipedia-page";

export default function OpenPage(props: LaunchProps<{ arguments: Arguments.OpenPage }>) {
	const [language] = useLanguage();
	// A deeplink cannot pass arguments, so an article link from another article
	// arrives as the launch's fallback text.
	return <WikipediaPage title={props.arguments.title ?? props.fallbackText ?? ""} language={language} />;
}
