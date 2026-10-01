import { List } from "@vicinae/api";
import { useState, type ReactElement } from "react";

import { multiTranslate, type Translation } from "~/api/google";
import { useDebouncedValue, usePreferences, usePromise, useSourceLanguage, useTargetLanguages, useTextState } from "~/hooks";
import { LanguageDropdown } from "~/QuickTranslate/LanguageDropdown";
import { QuickTranslateListItem } from "~/QuickTranslate/QuickTranslateListItem";

/**
 * A line-for-line port of the reference's `quick-translate.tsx`, including its
 * 500 ms debounce and its one request per target language.
 */
export default function QuickTranslate(): ReactElement {
  const [sourceLanguage] = useSourceLanguage();
  const [targetLanguages] = useTargetLanguages();
  const { prioritizeCrossLanguage } = usePreferences();
  const [isShowingDetail, setIsShowingDetail] = useState(true);
  const [text, setText] = useTextState();
  const debouncedText = useDebouncedValue(text, 500).trim();

  const { data, isLoading } = usePromise(multiTranslate, [
    debouncedText,
    { langFrom: sourceLanguage, langTo: targetLanguages, prioritizeCrossLanguage },
  ]);

  const results: Translation[] = data ?? [];

  return (
    <List
      searchBarPlaceholder="Enter text to translate"
      searchText={text}
      onSearchTextChange={setText}
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarAccessory={<LanguageDropdown />}
    >
      {debouncedText && results.length > 0
        ? results.map((result) => (
            <QuickTranslateListItem
              key={result.to}
              debouncedText={debouncedText}
              result={result}
              isShowingDetail={isShowingDetail}
              setIsShowingDetail={setIsShowingDetail}
              originalSourceLanguage={sourceLanguage}
            />
          ))
        : null}
    </List>
  );
}