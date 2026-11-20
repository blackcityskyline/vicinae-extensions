import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  Image,
  Keyboard,
  List,
  open,
  showToast,
  Toast,
} from "@vicinae/api";

import path from "path";
import { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import { appIdsFrom, GitRepo, tildifyPath, GitRepoService, GitRepoType } from "./utils";
import { useUsageBasedSort } from "./hooks/useUsageBasedSort";

/** Open-with slots in preference order; the shortcuts match the preference titles. */
const OPEN_WITH_SHORTCUTS: (Keyboard.Shortcut | "open")[] = [
  "open",
  { modifiers: ["ctrl"], key: "return" },
  { modifiers: ["alt"], key: "return" },
  { modifiers: ["ctrl", "shift"], key: "return" },
  { modifiers: ["shift"], key: "return" },
];

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const gitReposState = useCachedPromise(GitRepoService.gitRepos);
  const favoriteGitReposState = useCachedPromise(GitRepoService.favorites);

  const favoriteGitRepos = gitReposState.data?.filter((gitRepo) =>
    favoriteGitReposState.data?.includes(gitRepo.fullPath),
  );

  const repoTypes = Object.keys(GitRepoType)
    .filter((key) => isNaN(Number(key)) && (preferences.includeSubmodules || key !== GitRepoType.Submodule))
    .map((repoType) => repoType as GitRepoType);
  const [currentRepoType, onRepoTypeChange] = useState(GitRepoType.All);

  const gitRepos = gitReposState.data?.filter((gitRepo) => !favoriteGitReposState.data?.includes(gitRepo.fullPath));
  const { data: sortedGitRepos, recordUsage } = useUsageBasedSort<GitRepo>(gitRepos || [], "gitRepos");

  return (
    <List
      isLoading={gitReposState.isLoading}
      searchBarAccessory={<GitRepoPropertyDropdown repoTypes={repoTypes} onRepoTypeChange={onRepoTypeChange} />}
    >
      <List.Section title="Favorites">
        {favoriteGitRepos
          ?.filter((repo) => currentRepoType === GitRepoType.All || currentRepoType === repo.repoType)
          .map((repo) => (
            <GitRepoListItem
              key={repo.fullPath}
              preferences={preferences}
              repo={repo}
              isFavorite={true}
              revalidate={favoriteGitReposState.revalidate}
            />
          ))}
      </List.Section>
      <List.Section title={favoriteGitRepos?.length ? "Repos" : undefined}>
        {sortedGitRepos
          ?.filter((repo) => currentRepoType === GitRepoType.All || currentRepoType === repo.repoType)
          .map((repo) => (
            <GitRepoListItem
              key={repo.fullPath}
              preferences={preferences}
              repo={repo}
              isFavorite={false}
              revalidate={favoriteGitReposState.revalidate}
              recordUsageHook={recordUsage}
            />
          ))}
      </List.Section>
    </List>
  );
}


function GitRepoListItem(props: {
  preferences: Preferences;
  repo: GitRepo;
  isFavorite: boolean;
  revalidate: () => void;
  recordUsageHook?: (id: string | number) => void;
}) {
  const preferences = props.preferences;
  const repo = props.repo;
  const isFavorite = props.isFavorite;
  const appIds = appIdsFrom(preferences);
  const tildifiedPath = tildifyPath(repo.fullPath);
  const keywords = (() => {
    switch (preferences.searchKeys) {
      default:
      case "name":
        return [repo.name];
      case "fullPath":
        return tildifiedPath.split(path.sep);
    }
  })();

  return (
    <List.Item
      title={repo.name}
      icon={repo.icon}
      accessories={[{ text: tildifiedPath }]}
      keywords={keywords}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {appIds.map((appId, index) => (
              <GitRepoOpenAction
                key={appId}
                repo={repo}
                appId={appId}
                shortcut={OPEN_WITH_SHORTCUTS[index] ?? { modifiers: ["ctrl", "alt"], key: "return" }}
                recordUsageHook={props.recordUsageHook}
              />
            ))}
            <Action.OpenWith path={repo.fullPath} title="Open with…" shortcut={{ modifiers: ["ctrl"], key: "o" }} />
            <Action
              title="Open in All Applications"
              icon={Icon.ChevronUp}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "a" }}
              onAction={() => {
                for (const appId of appIds) {
                  void open(repo.fullPath, appId).catch(() => undefined);
                }
              }}
            />
            <Action
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              icon={isFavorite ? Icon.StarDisabled : Icon.Star}
              shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }}
              onAction={async () => {
                if (props.isFavorite) {
                  await GitRepoService.removeFromFavorites(repo);
                } else {
                  await GitRepoService.addToFavorites(repo);
                }
                props.revalidate();
              }}
            />
            {appIds[0] && (
              <Action.CreateQuicklink
                title="Create Quicklink"
                quicklink={{
                  link: repo.fullPath,
                  name: repo.name,
                  application: appIds[0],
                }}
                shortcut={{ modifiers: ["ctrl", "shift"], key: "l" }}
              />
            )}
          </ActionPanel.Section>
          <ActionPanel.Section>
            {repo.remotes.map((remote) => {
              let shortcut = undefined as Keyboard.Shortcut | undefined;
              switch (remote.name) {
                case "origin":
                  shortcut = { modifiers: ["ctrl", "shift"], key: "o" };
                  break;
                case "upstream":
                  shortcut = { modifiers: ["ctrl", "shift"], key: "u" };
                  break;

                default:
                  break;
              }

              let icon = undefined as Image | undefined;
              let host = remote.host;
              switch (remote.host) {
                case "github.com":
                  icon = { source: "github-icon.png", tintColor: Color.PrimaryText };
                  host = "GitHub";
                  break;
                case "gitlab.com":
                  icon = { source: "gitlab-icon.png", tintColor: Color.PrimaryText };
                  host = "GitLab";
                  break;
                case "bitbucket.org":
                  icon = { source: "bitbucket-icon.png", tintColor: Color.PrimaryText };
                  host = "Bitbucket";
                  break;

                default:
                  break;
              }
              if (remote.host === "github.com") {
                return (
                  <ActionPanel.Submenu
                    title={`Open ${remote.name} on ${host}`}
                    key={`GitHub_${remote.name}`}
                    icon={icon ?? Icon.Globe01}
                    shortcut={shortcut}
                  >
                    <Action.OpenInBrowser
                      title={`Code`}
                      key={`code ${remote.name}`}
                      url={remote.url}
                      icon={{ source: "github-code-icon.png", tintColor: Color.PrimaryText }}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
                    />
                    <Action.OpenInBrowser
                      title={`Issues`}
                      key={`issues ${remote.name}`}
                      url={`${remote.url}/issues`}
                      icon={{ source: "github-issues-icon.png", tintColor: Color.PrimaryText }}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "i" }}
                    />
                    <Action.OpenInBrowser
                      title={`Pull Requests`}
                      key={`pulls ${remote.name}`}
                      url={`${remote.url}/pulls`}
                      icon={{ source: "github-pulls-icon.png", tintColor: Color.PrimaryText }}
                      shortcut={{ modifiers: ["ctrl", "shift"], key: "p" }}
                    />
                  </ActionPanel.Submenu>
                );
              } else {
                return (
                  <Action.OpenInBrowser
                    title={`Open ${remote.name} on ${host}`}
                    key={`open remote ${remote.name}`}
                    url={remote.url}
                    shortcut={shortcut}
                    icon={icon ?? Icon.Globe01}
                  />
                );
              }
            })}
            <Action.CopyToClipboard title="Copy Path to Clipboard" content={repo.fullPath} shortcut="copy" />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function GitRepoPropertyDropdown(props: {
  repoTypes: GitRepoType[];
  onRepoTypeChange: (newValue: GitRepoType) => void;
}) {
  const { repoTypes, onRepoTypeChange } = props;
  return (
    <List.Dropdown
      tooltip="Filter repo type"
      storeValue={true}
      onChange={(newValue) => {
        onRepoTypeChange(newValue as GitRepoType);
      }}
    >
      {repoTypes
        .map((repoType) => GitRepoType[repoType])
        .map((repoType) => (
          <List.Dropdown.Item key={repoType} title={repoType} value={repoType} />
        ))}
    </List.Dropdown>
  );
}

function GitRepoOpenAction(props: {
  repo: GitRepo;
  appId: string;
  shortcut?: Keyboard.Shortcut | "open";
  recordUsageHook?: (id: string | number) => void;
}) {
  const appId = props.appId;
  return (
    <Action
      title={`Open in ${appId}`}
      icon={Icon.AppWindow}
      shortcut={props.shortcut}
      onAction={async () => {
        try {
          await open(props.repo.fullPath, appId);
          props.recordUsageHook?.(props.repo.name);
        } catch (error) {
          await showToast({
            style: Toast.Style.Failure,
            title: `Could not open with ${appId}`,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }}
    />
  );
}
