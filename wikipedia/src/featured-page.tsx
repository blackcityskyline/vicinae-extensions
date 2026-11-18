import { closeMainWindow, launchCommand, LaunchType, open, showToast, Toast } from "@vicinae/api";

import { storedLanguage } from "~/api/language";
import { getTodayFeaturedPageUrl } from "~/utils/api";
import { errorText } from "~/utils/error";
import { opensInBrowser } from "~/utils/preferences";

export default async function featuredPage() {
	try {
		const language = await storedLanguage();
		const { title, url } = await getTodayFeaturedPageUrl(language);

		if (opensInBrowser) {
			await open(url);
			await closeMainWindow({ clearRootSearch: true });
			return;
		}

		await launchCommand({ type: LaunchType.UserInitiated, name: "open-page", arguments: { title } });
	} catch (cause) {
		await showToast({
			style: Toast.Style.Failure,
			title: "Could not open the featured page",
			message: errorText(cause),
		});
	}
}
