import { closeMainWindow, launchCommand, LaunchType, open, showToast, Toast } from "@vicinae/api";

import { storedLanguage } from "~/api/language";
import { getRandomPageUrl } from "~/utils/api";
import { errorText } from "~/utils/error";
import { opensInBrowser } from "~/utils/preferences";

export default async function randomPage() {
	try {
		const language = await storedLanguage();
		const { title, url } = await getRandomPageUrl(language);

		if (opensInBrowser) {
			await open(url);
			await closeMainWindow({ clearRootSearch: true });
			return;
		}

		await launchCommand({ type: LaunchType.UserInitiated, name: "open-page", arguments: { title } });
	} catch (cause) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Could not open a random page",
			message: errorText(cause),
		});
	}
}
