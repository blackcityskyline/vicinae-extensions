import { ActionPanel, Detail, List } from "@vicinae/api";
import type { ReactElement } from "react";

import type { Translation } from "~/api/google";
import {
  ConfigurableCopyPasteActions,
  OpenOnGoogleTranslateWebsiteAction,
  ToggleFullTextAction,
} from "~/actions";
import { languageName } from "~/utils/languages";
import { detailMarkdown, keywordsFor } from "~/utils/result";

export function QuickTranslateListItem({
  debouncedText,
  result,
  isShowingDetail,
  setIsShowingDetail,
  originalSourceLanguage,
}: {
  debouncedText: string;
  result: Translation;
  isShowingDetail: boolean;
  setIsShowingDetail: (value: boolean) => void;
  originalSourceLanguage: string;
}): ReactElement {
  const from = languageName(result.from);
  const to = languageName(result.to);

  return (
    <List.Item
      title={result.text}
      // Upstream passes no keywords at all, so the filter matches the translation
      // against the text being typed and the list empties itself.
      keywords={keywordsFor(debouncedText, result)}
      accessories={[
        { text: to, tooltip: `${from} -> ${to}` },
        ...(result.synonyms.length > 0
          ? [{ text: `${result.synonyms.reduce((total, group) => total + group.words.length, 0)} synonyms` }]
          : []),
      ]}
      detail={<Detail markdown={detailMarkdown(debouncedText, result)} />}
      actions={
        <ActionPanel>
          <ConfigurableCopyPasteActions defaultActionsPrefix="Translation" value={result.text} />
          <ToggleFullTextAction onAction={() => setIsShowingDetail(!isShowingDetail)} />
          <OpenOnGoogleTranslateWebsiteAction
            translationText={debouncedText}
            translation={{ from: result.from, to: result.to }}
          />
        </ActionPanel>
      }
    />
  );
}
