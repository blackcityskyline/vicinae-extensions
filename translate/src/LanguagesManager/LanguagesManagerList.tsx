import { Action, ActionPanel, Color, Icon, Keyboard, List, showToast, Toast, useNavigation } from "@vicinae/api";
import type { ReactElement } from "react";

import { useAllLanguageSets, usePreferencesLanguageSet, useSelectedLanguagesSet } from "~/hooks";
import type { LanguageCodeSet } from "~/types";
import { asLanguage } from "~/utils/languages";
import { formatLanguageSet, isSameLanguageSet } from "~/utils";
import { AddLanguageForm } from "./AddLanguageForm";

export function LanguagesManagerItem({
  languageSet,
  onSelect,
  onDelete,
  selected,
}: {
  languageSet: LanguageCodeSet;
  onSelect: () => void;
  onDelete?: () => void;
  selected?: boolean;
}): ReactElement {
  const langFrom = asLanguage(languageSet.langFrom);
  const langsTo = languageSet.langTo.map(asLanguage);

  return (
    <List.Item
      title={`${langFrom.name}   ->`}
      subtitle={` ${langsTo.map((language) => language.name).join(", ")}`}
      keywords={[langFrom.name, langFrom.code, ...langsTo.flatMap((l) => [l.name, l.code])]}
      icon={selected ? { tintColor: Color.Green, source: Icon.Checkmark } : undefined}
      actions={
        <ActionPanel>
          <Action
            title="Select"
            icon={{ tintColor: Color.Green, source: Icon.Checkmark }}
            onAction={onSelect}
          />
          {onDelete ? (
            <Action style="destructive" title="Delete" icon={Icon.Trash} onAction={onDelete} />
          ) : null}
        </ActionPanel>
      }
    />
  );
}

export function LanguagesManagerList(): ReactElement {
  const navigation = useNavigation();
  const preferencesSet = usePreferencesLanguageSet();
  const [selected, setSelected] = useSelectedLanguagesSet();
  const [saved, setSaved] = useAllLanguageSets();

  return (
    <List
      actions={
        <ActionPanel>
          <Action
            title="Remove All"
            shortcut={Keyboard.Shortcut.Common.RemoveAll}
            onAction={() => setSaved([])}
          />
        </ActionPanel>
      }
    >
      <List.Item
        icon={{ source: Icon.Plus }}
        title="Add new language set..."
        actions={
          <ActionPanel>
            <Action.Push
              icon={Icon.Plus}
              title="Add New Language Set…"
              shortcut={Keyboard.Shortcut.Common.New}
              target={
                <AddLanguageForm
                  onAddLanguage={(languageSet) => {
                    setSaved([...saved, languageSet]);
                    void navigation.pop();
                    void showToast(Toast.Style.Success, "Language set was saved!", formatLanguageSet(languageSet));
                  }}
                />
              }
            />
          </ActionPanel>
        }
      />

      {!saved.some((set) => isSameLanguageSet(set, selected)) &&
      !isSameLanguageSet(preferencesSet, selected) ? (
        <List.Item
          icon={Icon.SaveDocument}
          title="Save current set"
          subtitle={formatLanguageSet(selected)}
          actions={
            <ActionPanel>
              <Action title="Save Current Set" onAction={() => setSaved([...saved, selected])} />
            </ActionPanel>
          }
        />
      ) : null}

      <LanguagesManagerItem
        languageSet={preferencesSet}
        selected={isSameLanguageSet(selected, preferencesSet)}
        onSelect={() => {
          setSelected(preferencesSet);
          void navigation.pop();
        }}
      />

      {saved.map((languageSet) => (
        <LanguagesManagerItem
          key={`${languageSet.langFrom} ${languageSet.langTo.toString()}`}
          languageSet={languageSet}
          selected={isSameLanguageSet(selected, languageSet)}
          onSelect={() => {
            setSelected(languageSet);
            void navigation.pop();
          }}
          onDelete={() => {
            setSaved(saved.filter((set) => !isSameLanguageSet(set, languageSet)));
            void showToast(Toast.Style.Success, "Language set was deleted!", formatLanguageSet(languageSet));
          }}
        />
      ))}
    </List>
  );
}
