import { Action, Icon } from "@vicinae/api";
import type { ReactElement } from "react";

import { usePreferences } from "~/hooks";
import { websiteUrl } from "~/utils";

/**
 * Copy and paste, in whichever order the `defaultAction` preference asks for.
 * The reference's version, unchanged.
 */
export function ConfigurableCopyPasteActions({
  defaultActionsPrefix,
  value,
}: {
  value: string;
  defaultActionsPrefix?: string;
}): ReactElement {
  const { defaultAction } = usePreferences();
  const label = defaultActionsPrefix ?? "";

  const paste = <Action.Paste key="paste" title={`Paste ${label}`.trim()} content={value} />;
  const copy = <Action.CopyToClipboard key="copy" title={`Copy ${label}`.trim()} content={value} />;

  return defaultAction === "paste" ? (
    <>
      {paste}
      {copy}
    </>
  ) : (
    <>
      {copy}
      {paste}
    </>
  );
}

export function ToggleFullTextAction({ onAction }: { onAction: () => void }): ReactElement {
  return (
    <Action
      title="Toggle Full Text"
      icon={Icon.Text}
      onAction={onAction}
      shortcut={{ modifiers: ["cmd"], key: "f" }}
    />
  );
}

export function OpenOnGoogleTranslateWebsiteAction({
  translationText,
  translation,
}: {
  translationText: string;
  translation: { from: string; to: string };
}): ReactElement {
  return (
    <Action.OpenInBrowser
      title="Open in Google Translate"
      shortcut={{ modifiers: ["alt"], key: "enter" }}
      url={websiteUrl(translation.from, translation.to, translationText)}
    />
  );
}