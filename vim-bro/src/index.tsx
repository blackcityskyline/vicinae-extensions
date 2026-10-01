import { List, ActionPanel, Action, Icon, Clipboard, showToast } from "@raycast/api";
import { useEffect, useState } from "react";

import commandsRaw from "./commands.json";
import { Command, CommandGroup } from "./types";
import { searchKeywordInCommandGroups, formatCommandForClipboard } from "./utils";
import { useLocalStorage } from "@raycast/utils";

export default function CommandSearch() {
  const commandGroups = commandsRaw as CommandGroup[];

  const [searchText, setSearchText] = useState("");
  const [filteredList, setFilteredList] = useState(commandGroups);
  const [filter, setFilter] = useState("");
  // `?? []` rather than a destructuring default of `[]`, and it has to stay that way.
  //
  // Upstream's `value: favorites = []` is right for Raycast, where an absent key is
  // `undefined`. Here it is `null`: the module Vicinae injects for
  // `require("@vicinae/api")` returns `Storage.get()` uncoerced, where the published
  // package does `return value ?? undefined`. `useLocalStorage` then runs
  // `JSON.parse(null)`, which is `null`, and a destructuring default only fires on
  // `undefined` — so `favorites` stayed null and `.includes` on it threw on first launch.
  const { isLoading, value, setValue: setFavorites } = useLocalStorage<string[]>("vim-favorites");
  const favorites = value ?? [];

  useEffect(() => {
    setFilteredList(searchKeywordInCommandGroups(searchText, commandGroups));
  }, [searchText]);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      navigationTitle="Search Vim Commands"
      searchBarPlaceholder="Learn new command by searching it here."
      searchBarAccessory={
        <List.Dropdown tooltip="Filter" onChange={setFilter}>
          <List.Dropdown.Item icon={Icon.Text} title="All" value="" />
          <List.Dropdown.Item icon={Icon.Star} title="Favorites" value="Favorites" />
        </List.Dropdown>
      }
    >
      {filteredList.map((commandGroup: CommandGroup) => {
        const key = commandGroup.key;
        const commands = commandGroup.commands.filter(
          (command) => !filter || (filter === "Favorites" && favorites.includes(command.kbd)),
        );
        return (
          <List.Section key={key} title={key[0].toUpperCase() + key.slice(1)}>
            {commands.map((command: Command) => {
              const isFavorite = favorites.includes(command.kbd);
              return (
                <List.Item
                  key={command.kbd}
                  title={command.kbd}
                  subtitle={command.text[0].toUpperCase() + command.text.slice(1)}
                  accessories={[{ icon: isFavorite ? Icon.Star : undefined }]}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Copy Command"
                        icon={Icon.Clipboard}
                        onAction={async () => {
                          const formattedCommand = formatCommandForClipboard(command.kbd);
                          await Clipboard.copy(formattedCommand);
                          await showToast({
                            title: "Copied to Clipboard",
                            message: formattedCommand,
                          });
                        }}
                      />
                      {!isFavorite ? (
                        <Action
                          icon={Icon.Star}
                          title="Add to Favorites"
                          onAction={() => setFavorites([...favorites, command.kbd])}
                        />
                      ) : (
                        <Action
                          icon={Icon.StarDisabled}
                          title="Remove from Favorites"
                          onAction={() => setFavorites(favorites.filter((fav) => fav !== command.kbd))}
                        />
                      )}
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        );
      })}
    </List>
  );
}
