import { useCallback, useEffect, useState } from "react";

import { Action, ActionPanel, Clipboard, Icon, Keyboard, List, showToast, Toast } from "@vicinae/api";

import type { PublicInfo } from "~/api/public.ts";
import { getPublicIp } from "~/api/public-store.ts";
import { CopyAction } from "~/components/actions.tsx";
import { PublicDetail } from "~/components/details.tsx";

// A view command, not no-view: on Vicinae 0.29.2 a no-view worker's
// Clipboard.copy resolves but never reaches the system clipboard, and its
// showToast never resolves at all. Both work while a window is open.
export default function Command() {
	const [info, setInfo] = useState<PublicInfo | null>(null);
	const [copied, setCopied] = useState(false);

	const lookup = useCallback(async () => {
		const result = await getPublicIp(true);
		setInfo(result);
		if (!result.ip || result.status === "offline") return;
		await Clipboard.copy(result.ip);
		setCopied(true);
		await showToast({ style: Toast.Style.Success, title: "Copied public IP", message: result.ip });
	}, []);

	useEffect(() => {
		void lookup();
	}, [lookup]);

	if (info && (!info.ip || info.status === "offline")) {
		return (
			<List>
				<List.EmptyView
					icon={Icon.Warning}
					title="No public IP"
					description="No endpoint answered."
					actions={
						<ActionPanel>
							<Action
								title="Look Up Again"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={() => void lookup()}
							/>
						</ActionPanel>
					}
				/>
			</List>
		);
	}

	const subtitle = info
		? (copied ? "Copied · " : "") +
			(info.status === "stale" ? "Stale · " : "") +
			[info.org, info.city, info.country].filter(Boolean).join(" · ")
		: "Asking the public IP endpoints";

	return (
		<List isShowingDetail isLoading={!info}>
			{info ? (
				<List.Item
					id="public"
					title={info.ip}
					subtitle={subtitle}
					icon={Icon.Globe01}
					detail={<PublicDetail info={info} />}
					actions={
						<ActionPanel>
							<CopyAction title="Copy Public IP" content={info.ip} shortcut={Keyboard.Shortcut.Common.Copy} />
							<Action
								title="Look Up Again"
								icon={Icon.ArrowClockwise}
								shortcut={Keyboard.Shortcut.Common.Refresh}
								onAction={() => void lookup()}
							/>
						</ActionPanel>
					}
				/>
			) : null}
		</List>
	);
}