import { Action, ActionPanel, Detail, Icon, List, showToast, Toast } from "@vicinae/api";
import { Fragment, useEffect, useMemo, useState, type ReactElement } from "react";

import { doubleWayTranslate, multiTranslate, speak, type Translation } from "~/api/google";
import {
  ConfigurableCopyPasteActions,
  OpenOnGoogleTranslateWebsiteAction,
  ToggleFullTextAction,
} from "~/actions";
import {
  useAllLanguageSets,
  useDebouncedValue,
  usePreferences,
  usePreferencesLanguageSet,
  useSelectedLanguagesSet,
  useTextState,
} from "~/hooks";
import { LanguagesManagerListDropdown } from "~/LanguagesManager";
import type { LanguageCodeSet } from "~/types";
import { formatLanguageSet, isSameLanguageSet } from "~/utils";
import { languageName } from "~/utils/languages";
import { detailMarkdown, keywordsFor } from "~/utils/result";

/**
 * The reference's `translate`.
 *
 * Two changes and one merge:
 *
 * - `DoubleWayTranslateItem` and `MultiTranslateItems` were 95% the same code,
 *   differing only in which function produced the rows. They are one component
 *   here. The duplication is also where the reference's unguarded
 *   `langFrom.name` lived, which threw on any language its table had not heard
 *   of.
 * - Every row carries `keywords`, and its detail panel shows the text that was
 *   typed. Neither existed before, and without them the list filters itself empty
 *   while you type.
 */
function ResultList({
  value,
  languageSet,
  load,
  toggleShowingDetail,
}: {
  value: string;
  languageSet: LanguageCodeSet;
  load: (text: string, set: LanguageCodeSet) => Promise<Translation[]>;
  toggleShowingDetail: () => void;
}): ReactElement {
  const [results, setResults] = useState<Translation[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setResults(null);
    setFailed(null);

    load(value, languageSet).then(
      (rows) => {
        if (live) setResults(rows);
      },
      (error: unknown) => {
        if (!live) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        setFailed(failure.message);
        void showToast({ style: Toast.Style.Failure, title: failure.name, message: failure.message });
      },
    );

    return () => {
      live = false;
    };
  }, [value, languageSet, load]);

  if (failed) return <List.EmptyView icon={Icon.XMarkCircle} title="Could not translate" description={failed} />;
  if (!results) return <List.EmptyView icon={Icon.Hourglass} title="Translating..." />;

  return (
    <>
      {results.map((result) => {
        const from = languageName(result.from);
        const to = languageName(result.to);
        const languages = `${from} -> ${to}`;

        return (
          <Fragment key={`${result.to}-${result.text}`}>
            <List.Item
              title={result.text}
              keywords={keywordsFor(value, result)}
              accessories={[{ text: languages, tooltip: languages }]}
              detail={<Detail markdown={detailMarkdown(value, result)} />}
              actions={
                <ActionPanel>
                  <ConfigurableCopyPasteActions defaultActionsPrefix="Translation" value={result.text} />
                  <ToggleFullTextAction onAction={toggleShowingDetail} />
                  <Action
                    title="Play Text-To-Speech"
                    icon={Icon.Play}
                    shortcut={{ modifiers: ["cmd"], key: "t" }}
                    onAction={() => speak(result.text, result.to)}
                  />
                  <OpenOnGoogleTranslateWebsiteAction
                    translationText={value}
                    translation={{ from: result.from, to: result.to }}
                  />
                  <QuickLanguageSetShifterActions />
                </ActionPanel>
              }
            />
            {result.transliteration ? (
              <List.Item
                title={result.transliteration}
                accessories={[{ text: languages, tooltip: languages }]}
                detail={<Detail markdown={result.transliteration} />}
                actions={
                  <ActionPanel>
                    <ConfigurableCopyPasteActions value={result.transliteration} />
                    <ToggleFullTextAction onAction={toggleShowingDetail} />
                    <OpenOnGoogleTranslateWebsiteAction
                      translationText={value}
                      translation={{ from: result.from, to: result.to }}
                    />
                    <QuickLanguageSetShifterActions />
                  </ActionPanel>
                }
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

/** Steps through the saved language sets, as in the reference. */
function QuickLanguageSetShifterActions(): ReactElement {
  const [selected, setSelected] = useSelectedLanguagesSet();
  const preferencesSet = usePreferencesLanguageSet();
  const [saved] = useAllLanguageSets();
  const all = useMemo(() => [preferencesSet, ...saved], [preferencesSet, saved]);

  const index = all.findIndex((set) => isSameLanguageSet(set, selected));
  const step = (delta: number) => {
    const next = index + delta;
    setSelected(all[next < 0 ? all.length - 1 : next >= all.length ? 0 : next] ?? selected);
  };

  return (
    <ActionPanel.Section title="Language Set">
      <Action title="Go to Previous Language Set" icon={Icon.ArrowUp} onAction={() => step(-1)} />
      <Action title="Go to Next Language Set" icon={Icon.ArrowDown} onAction={() => step(1)} />
      <Action.Push title="Manage Language Sets…" icon={Icon.Pencil} target={<LanguagesManagerListDropdown />} />
      <Action.CopyToClipboard title="Copy Current Language Set" content={formatLanguageSet(selected)} />
    </ActionPanel.Section>
  );
}

export default function Translate(): ReactElement {
  const [selected] = useSelectedLanguagesSet();
  const { prioritizeCrossLanguage } = usePreferences();
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const [text, setText] = useTextState();
  const debounced = useDebouncedValue(text, 500);

  const languageSet = useMemo<LanguageCodeSet>(
    () => ({ ...selected, prioritizeCrossLanguage }),
    [selected, prioritizeCrossLanguage],
  );

  // One target translates both ways; more than one translates into each.
  const load = selected.langTo.length === 1 ? doubleWayTranslate : multiTranslate;

  return (
    <List
      searchBarPlaceholder="Enter text to translate"
      searchText={text}
      onSearchTextChange={setText}
      isShowingDetail={isShowingDetail}
      searchBarAccessory={<LanguagesManagerListDropdown />}
      actions={
        <ActionPanel>
          <QuickLanguageSetShifterActions />
        </ActionPanel>
      }
    >
      <ResultList
        value={debounced.trim()}
        languageSet={languageSet}
        load={load}
        toggleShowingDetail={() => setIsShowingDetail(!isShowingDetail)}
      />
    </List>
  );
}