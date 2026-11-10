import { showHUD, type LaunchProps } from "@vicinae/api";

import { openFromPreferences } from "~/api/open.ts";
import { toUrl } from "~/utils/url.ts";

export default async function Command(props: LaunchProps<{ arguments: Arguments.OpenUrl }>) {
  const error = await openFromPreferences(toUrl(props.arguments?.url ?? ""));
  if (error) {
    await showHUD(error);
    return;
  }
  await showHUD("Opened in Little Chrome");
}
