import { Action, ActionPanel, Clipboard, Detail, Icon, List } from "@vicinae/api";

import type { Translation } from "~/api/google";
import { languageName } from "~/utils/languages";
import { detailMarkdown, keywordsFor } from "~/utils/result";

/** Verified 200 with text in the query. */
export function websiteUrl(source: string, translation: Translation): string {
  const query = new URLSearchParams({
    sl: translation.from,
    tl: translation.to,
    text: source,
    op: "translate",
  });
  return `https://translate.google.com/?${query}`;
}

export function TranslationRow({
  source,
  translation,
  pasteFirst,
}: {
  source: string;
  translation: Translation;
  /** Which of the two do-nothing actions `Enter` should do. */
  pasteFirst: boolean;
}) {
  const copy = (
    <Action.CopyToClipboard
      key="copy"
      title="Copy Translation"
      content={translation.text}
      icon={Icon.CopyClipboard}
    />
  );

  const paste = (
    <Action
      key="paste"
      title="Paste Translation"
      icon={Icon.Checkmark}
      // Native: writes the clipboard and sends it to the window that was focused.
      onAction={() => void Clipboard.paste(translation.text)}
    />
  );

  const from = languageName(translation.from);
  const to = languageName(translation.to);

  return (
    <List.Item
      title={translation.text}
      // Without these the list filters the rows against the text being typed and
      // empties itself, which is what upstream does.
      keywords={keywordsFor(source, translation)}
      detail={<Detail markdown={detailMarkdown(source, translation)} />}
      accessories={[{ text: to, tooltip: `${from} → ${to}` }]}
      actions={
        <ActionPanel>
          {pasteFirst ? [paste, copy] : [copy, paste]}
          <Action.OpenInBrowser
            title="Open on Google Translate"
            url={websiteUrl(source, translation)}
            icon={Icon.Globe01}
          />
          <Action.CopyToClipboard title="Copy Original Text" content={source} icon={Icon.BlankDocument} />
        </ActionPanel>
      }
    />
  );
}

