import { Icon, List, useNavigation } from "@vicinae/api";
import type { ReactElement } from "react";

import { useAllLanguageSets, usePreferencesLanguageSet, useSelectedLanguagesSet } from "~/hooks";
import type { LanguageCodeSet } from "~/types";
import { formatLanguageSet } from "~/utils";
import { LanguagesManagerList } from "./LanguagesManagerList";

/** The language-set picker in the search bar accessory, as in the reference. */
export function LanguagesManagerListDropdown(): ReactElement {
  const navigation = useNavigation();
  const preferencesSet = usePreferencesLanguageSet();
  const [selected, setSelected] = useSelectedLanguagesSet();
  const [saved] = useAllLanguageSets();

  return (
    <List.Dropdown
      value={JSON.stringify(selected)}
      tooltip="Language Set"
      onChange={(value) => {
        if (value === "manage") {
          navigation.push(<LanguagesManagerList />);
          return;
        }
        setSelected(JSON.parse(value) as LanguageCodeSet);
      }}
    >
      <List.Dropdown.Item icon={Icon.Pencil} title="Manage language sets..." value="manage" />
      <List.Dropdown.Item
        title={formatLanguageSet(preferencesSet)}
        value={JSON.stringify(preferencesSet)}
      />
      {saved.map((set) => (
        <List.Dropdown.Item
          key={`${set.langFrom} ${set.langTo.toString()}`}
          title={formatLanguageSet(set)}
          value={JSON.stringify(set)}
        />
      ))}
    </List.Dropdown>
  );
}
