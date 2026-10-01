import { Icon, List } from "@vicinae/api";
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

  const targets = targetLanguages.join(",");
  const prioritize = prioritizeCrossLanguage === true;
  const [results, setResults] = useState<Translation[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);


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
      langTo: targets === "" ? [] : targets.split(","),
      prioritizeCrossLanguage: prioritize,
    }).then(
      (rows) => {
        if (live) setResults(rows);
      },
      (error: unknown) => {
        if (live) {
          setResults([]);
          setFailed(error instanceof Error ? error.message : String(error));
        }
      },
    );

    return () => {
      live = false;
    };
    // Same reason as Translate: object dependencies restart the load on every
    // render and the answer is thrown away as stale.
  }, [debouncedText, sourceLanguage, targets, prioritize]);

  return (
    <List
      searchBarPlaceholder="Enter text to translate"
      searchText={text}
      onSearchTextChange={setText}
      isLoading={debouncedText !== "" && !results}
      isShowingDetail={isShowingDetail}
      searchBarAccessory={<LanguageDropdown />}
    >
      {failed ? <List.EmptyView icon={Icon.XMarkCircle} title="Could not translate" description={failed} /> : null}
      {debouncedText && !failed && results
        ? results.map((result, index) => (
            <QuickTranslateListItem
              key={`${result.to}-${index}`}
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
