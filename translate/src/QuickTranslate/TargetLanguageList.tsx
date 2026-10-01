import { Action, ActionPanel, Icon, Keyboard, List, clearSearchBar } from "@vicinae/api";
import type { ReactElement } from "react";

import { AUTO_DETECT } from "~/api/google";
import { useTargetLanguages } from "~/hooks";
import { asLanguage, languages } from "~/utils/languages";

/** Add, remove and reorder the target languages, as in the reference. */
export function TargetLanguageList(): ReactElement {
  const [targetLanguages, setTargetLanguages] = useTargetLanguages();

  const move = (code: string, delta: number) => {
    const index = targetLanguages.indexOf(code);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= targetLanguages.length) return;

    const reordered = [...targetLanguages];
    reordered.splice(to, 0, ...reordered.splice(index, 1));
    setTargetLanguages(reordered);
  };

  return (
    <List searchBarPlaceholder="Search languages">
      <List.Section title="Selected Languages" subtitle={`${targetLanguages.length}`}>
        {targetLanguages.map((code) => (
          <List.Item
            key={code}
            title={asLanguage(code).name}
            subtitle={code}
            actions={
              targetLanguages.length === 1 && targetLanguages[0] === "en" ? undefined : (
                <ActionPanel>
                  <Action
                    title="Remove"
                    icon={Icon.Minus}
                    style="destructive"
                    shortcut={Keyboard.Shortcut.Common.Remove}
                    onAction={() => {
                      const left = targetLanguages.filter((lang) => lang !== code);
                      setTargetLanguages(left.length === 0 ? ["en"] : left);
                      void clearSearchBar();
                    }}
                  />
                  <Action
                    title="Move up"
                    icon={Icon.ArrowUp}
                    shortcut={{ modifiers: ["shift"], key: "arrowUp" }}
                    onAction={() => {
                      move(code, -1);
                      void clearSearchBar();
                    }}
                  />
                  <Action
                    title="Move Down"
                    icon={Icon.ArrowDown}
                    shortcut={{ modifiers: ["shift"], key: "arrowDown" }}
                    onAction={() => {
                      move(code, 1);
                      void clearSearchBar();
                    }}
                  />
                </ActionPanel>
              )
            }
          />
        ))}
      </List.Section>

      <List.Section title="Available Languages">
        {languages
          .filter((language) => language.code !== AUTO_DETECT && !targetLanguages.includes(language.code))
          .map((language) => (
            <List.Item
              key={language.code}
              title={language.name}
              subtitle={language.code}
              accessories={[{ text: "Add" }]}
              actions={
                <ActionPanel>
                  <Action
                    title="Add"
                    icon={Icon.Plus}
                    shortcut={Keyboard.Shortcut.Common.New}
                    onAction={() => {
                      setTargetLanguages([...targetLanguages, language.code]);
                      void clearSearchBar();
                    }}
                  />
                </ActionPanel>
              }
            />
          ))}
      </List.Section>
    </List>
  );
}
