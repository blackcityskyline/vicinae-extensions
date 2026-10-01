import React, { useState, type ReactElement } from "react";

import { Action, ActionPanel, Detail, Icon, List, showToast, Toast } from "@vicinae/api";

import { doubleWayTranslate, multiTranslate, playTTS, type Translation } from "~/api/google";
import {
  ConfigurableCopyPasteActions,
  OpenOnGoogleTranslateWebsiteAction,
  ToggleFullTextAction,
} from "~/actions";
import {
  useAllLanguageSets,
  useDebouncedValue,
  usePreferencesLanguageSet,
  usePromise,
  useSelectedLanguagesSet,
  useTextState,
} from "~/hooks";
import { LanguagesManagerListDropdown } from "~/LanguagesManager";
import type { LanguageCodeSet } from "~/types";
import { isSameLanguageSet } from "~/utils";
import { languageName } from "~/utils/languages";
import { detailMarkdown } from "~/utils/result";

/**
 * A line-for-line port of the reference's `translate.tsx`.
 *
 * What had to change, and nothing else:
 *
 * - `@raycast/api` and `@raycast/utils` became `@vicinae/api` and the local
 *   `usePromise`/`useStored`, which have the same signatures.
 * - `translatedText` and `pronunciationText` are `text` and `transliteration`.
 * - `Action.Style.Destructive` is `style="destructive"`.
 * - The two shortcut objects collapsed to the Linux one, since `cmd` maps to
 *   control off macOS.
 * - `noUncheckedIndexedAccess` needs a fallback where the reference indexes an
 *   array directly.
 * - The detail panel. That is the one addition, and the reason for this port: the
 *   reference shows the translation twice and never the text that was typed, and
 *   it throws away the dictionary, the alternatives and the definitions that come
 *   back in the same response.
 */

const QuickLanguageSetShifterActions = () => {
  const [selectedLanguageSet, setSelectedLanguageSet] = useSelectedLanguagesSet();
  const preferencesLanguageSet = usePreferencesLanguageSet();
  const [languages] = useAllLanguageSets();
  const allLanguages = [preferencesLanguageSet, ...languages];

  const selectedLanguageSetIndex = allLanguages.findIndex((langSet) =>
    isSameLanguageSet(langSet, selectedLanguageSet),
  );

  return (
    <ActionPanel.Section title="Language Set">
      <Action
        title="Go to Previous Language Set"
        icon={Icon.ArrowUp}
        shortcut={{ modifiers: ["cmd"], key: "arrowUp" }}
        onAction={() => {
          if (selectedLanguageSetIndex <= 0) {
            setSelectedLanguageSet(allLanguages[allLanguages.length - 1] ?? selectedLanguageSet);
          } else {
            setSelectedLanguageSet(allLanguages[selectedLanguageSetIndex - 1] ?? selectedLanguageSet);
          }
        }}
      />
      <Action
        title="Go to Next Language Set"
        icon={Icon.ArrowDown}
        shortcut={{ modifiers: ["cmd"], key: "arrowDown" }}
        onAction={() => {
          if (selectedLanguageSetIndex >= allLanguages.length - 1) {
            setSelectedLanguageSet(allLanguages[0] ?? selectedLanguageSet);
          } else {
            setSelectedLanguageSet(allLanguages[selectedLanguageSetIndex + 1] ?? selectedLanguageSet);
          }
        }}
      />
    </ActionPanel.Section>
  );
};

/** The rows themselves, shared by the two branches below because they are identical. */
const ResultRows = ({
  rows,
  value,
  toggleShowingDetail,
}: {
  rows: Translation[];
  value: string;
  toggleShowingDetail: () => void;
}) => (
  <>
    {rows.map((r, index) => {
      const langFrom = languageName(r.from);
      const langTo = languageName(r.to);
      const languages = `${langFrom} -> ${langTo}`;
      const tooltip = `${langFrom} -> ${langTo}`;

      return (
        <React.Fragment key={index}>
          <List.Item
            title={r.text}
            accessories={[{ text: languages, tooltip }]}
            detail={<Detail markdown={detailMarkdown(value, r)} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <ConfigurableCopyPasteActions defaultActionsPrefix="Translation" value={r.text} />
                  <ToggleFullTextAction onAction={toggleShowingDetail} />
                  <Action
                    title="Play Text-To-Speech"
                    icon={Icon.Play}
                    shortcut={{ modifiers: ["cmd"], key: "t" }}
                    onAction={() => playTTS(r.text, r.to)}
                  />
                  <OpenOnGoogleTranslateWebsiteAction translationText={value} translation={r} />
                  <QuickLanguageSetShifterActions />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
          {r.transliteration ? (
            <List.Item
              title={r.transliteration}
              accessories={[{ text: languages, tooltip }]}
              detail={<Detail markdown={r.transliteration} />}
              actions={
                <ActionPanel>
                  <ActionPanel.Section>
                    <ConfigurableCopyPasteActions value={r.transliteration} />
                    <ToggleFullTextAction onAction={toggleShowingDetail} />
                    <OpenOnGoogleTranslateWebsiteAction translationText={value} translation={r} />
                    <QuickLanguageSetShifterActions />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ) : null}
        </React.Fragment>
      );
    })}
  </>
);

const DoubleWayTranslateItem: React.FC<{
  value: string;
  selectedLanguageSet: LanguageCodeSet;
  toggleShowingDetail: () => void;
}> = ({ toggleShowingDetail, value, selectedLanguageSet }) => {
  const { data, isLoading, error } = usePromise(doubleWayTranslate, [value, selectedLanguageSet]);

  if (error) {
    void showToast({
      style: Toast.Style.Failure,
      title: "Could not translate",
      message: error.toString(),
    });
  }

  if (isLoading) return <List.EmptyView icon={Icon.Hourglass} title="Translating..." />;

  return <ResultRows rows={data ?? []} value={value} toggleShowingDetail={toggleShowingDetail} />;
};

const MultiTranslateItems: React.FC<{
  value: string;
  selectedLanguageSet: LanguageCodeSet;
  toggleShowingDetail: () => void;
}> = ({ toggleShowingDetail, value, selectedLanguageSet }) => {
  const { data, isLoading, error } = usePromise(multiTranslate, [value, selectedLanguageSet]);

  if (error) {
    void showToast({
      style: Toast.Style.Failure,
      title: "Could not translate",
      message: error.toString(),
    });
  }

  if (isLoading) return <List.EmptyView icon={Icon.Hourglass} title="Translating..." />;

  return <ResultRows rows={data ?? []} value={value} toggleShowingDetail={toggleShowingDetail} />;
};

export default function Translate(): ReactElement {
  const [selectedLanguageSet] = useSelectedLanguagesSet();
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const [text, setText] = useTextState();
  const debouncedValue = useDebouncedValue(text, 500);

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
      {selectedLanguageSet.langTo.length === 1 ? (
        <DoubleWayTranslateItem
          value={debouncedValue}
          selectedLanguageSet={selectedLanguageSet}
          toggleShowingDetail={() => setIsShowingDetail(!isShowingDetail)}
        />
      ) : (
        <MultiTranslateItems
          value={debouncedValue}
          selectedLanguageSet={selectedLanguageSet}
          toggleShowingDetail={() => setIsShowingDetail(!isShowingDetail)}
        />
      )}
    </List>
  );
}
