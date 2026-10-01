import { Icon, List, useNavigation } from "@vicinae/api";
import type { ReactElement } from "react";

import { useSourceLanguage, useTargetLanguages } from "~/hooks";
import type { LanguageCode } from "~/types";
import { languages, supportedLanguagesByCode } from "~/utils/languages";
import { TargetLanguageList } from "./TargetLanguageList";

/** The source-language picker in the search bar accessory, as in the reference. */
export function LanguageDropdown(): ReactElement {
  const navigation = useNavigation();
  const [sourceLanguage, setSourceLanguage] = useSourceLanguage();
  const [targetLanguages] = useTargetLanguages();

  return (
    <List.Dropdown
      value={sourceLanguage}
      tooltip="Language"
      onChange={(value) => {
        if (value === "manageTargetLanguages") {
          void navigation.push(<TargetLanguageList />);
          return;
        }
        setSourceLanguage(value as LanguageCode);
      }}
    >
      <List.Dropdown.Item
        key="manageTargetLanguages"
        icon={Icon.Pencil}
        title={`Translate to  ->  ${targetLanguages
          .map((code) => supportedLanguagesByCode[code]?.name ?? code)
          .join(" ")}`}
        value="manageTargetLanguages"
      />
      {languages.map((language) => (
        <List.Dropdown.Item key={language.code} title={language.name} value={language.code} />
      ))}
    </List.Dropdown>
  );
}
