import { List } from "@vicinae/api";
import { useEffect, useState, type ReactElement } from "react";

import { multiTranslate, type Translation } from "~/api/google";
import {
  useDebouncedValue,
  usePreferences,
  useSourceLanguage,
  useTargetLanguages,
  useTextState,
} from "~/hooks";
import { LanguageDropdown } from "~/QuickTranslate/LanguageDropdown";
import { QuickTranslateListItem } from "~/QuickTranslate/QuickTranslateListItem";

/** The reference's quick translate: type, and every target answers at once. */
export default function QuickTranslate(): ReactElement {
  const [sourceLanguage] = useSourceLanguage();
  const [targetLanguages] = useTargetLanguages();
  const { prioritizeCrossLanguage } = usePreferences();
  const [isShowingDetail, setIsShowingDetail] = useState(true);
  const [text, setText] = useTextState();
  const debouncedText = useDebouncedValue(text, 500).trim();

  const [results, setResults] = useState<Translation[] | null>(null);

  useEffect(() => {
    if (debouncedText === "") {
      setResults(null);
      return;
    }

    // One request per target language, which is what this command has always
    // done. Ten targets means ten requests per settled keystroke.
    let live = true;
    setResults(null);

    multiTranslate(debouncedText, {
      langFrom: sourceLanguage,
      langTo: targetLanguages,
      prioritizeCrossLanguage,
    }).then(
      (rows) => {
        if (live) setResults(rows);
      },
      () => {
        if (live) setResults([]);
      },
    );

    return () => {
      live = false;
    };
  }, [debouncedText, sourceLanguage, targetLanguages, prioritizeCrossLanguage]);

  return (
    <List
      searchBarPlaceholder="Enter text to translate"
      searchText={text}
      onSearchTextChange={setText}
      isLoading={debouncedText !== "" && !results}
      isShowingDetail={isShowingDetail}
      searchBarAccessory={<LanguageDropdown />}
    >
      {debouncedText && results
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
