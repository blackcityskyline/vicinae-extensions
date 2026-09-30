import { Action, ActionPanel, getPreferenceValues, Keyboard, showToast, Toast } from "@vicinae/api";
import { usePromise } from "@raycast/utils";

import { isStarred, setStarred } from "~/api/github";
import type { Repository } from "~/api/github";
import { cloneAndOpenInEditor } from "~/api/open-repository";
import { Icon } from "~/utils/icons";
import { clonePathFor, isSupportedEditor } from "~/utils/launch";

/**
 * The action panel for a repository row.
 *
 * Star state is not part of the REST payload, so it is fetched once per
 * repository and kept in the hook's cache: arrowing through a long list must not
 * re-query the API on every selection change.
 */
export default function RepositoryActions({ repository }: { repository: Repository }) {
  const { defaultEditor, cloneDirectory } = getPreferenceValues<Preferences>();
  const editorConfigured = isSupportedEditor(defaultEditor);
  const localPath = clonePathFor(cloneDirectory, repository.full_name);

  // The dependency is the repository, so selecting a different row re-reads the
  // star state while arrowing through a long list does not.
  const { data: starred, mutate: reloadStar } = usePromise(
    (fullName: string) => isStarred(repository.owner.login, repository.name),
    [repository.full_name],
  );

  async function toggleStar() {
    // Re-read rather than trusting a possibly-unloaded cache, so a star
    // pressed before the first fetch resolves cannot invert the wrong way.
    const current = starred ?? (await isStarred(repository.owner.login, repository.name));
    await setStarred(repository.owner.login, repository.name, !current);
    await reloadStar();
    await showToast({
      title: current ? `Unstarred ${repository.name}` : `Starred ${repository.name}`,
      style: Toast.Style.Success,
    });
  }

  return (
    <ActionPanel>
      {editorConfigured ? (
        <Action
          title={`Open in ${defaultEditor}`}
          icon={Icon.Code}
          onAction={async () => {
            await cloneAndOpenInEditor(repository, defaultEditor, cloneDirectory);
          }}
        />
      ) : (
        <Action.OpenInBrowser title="Open in Browser" url={repository.html_url} />
      )}

      {editorConfigured ? <Action.OpenInBrowser title="Open in Browser" url={repository.html_url} /> : null}

      <Action.CopyToClipboard
        title="Copy Clone URL (SSH)"
        icon={Icon.Link}
        content={`git@github.com:${repository.full_name}.git`}
        shortcut={Keyboard.Shortcut.Common.Copy}
      />
      <Action.CopyToClipboard
        title="Copy Clone URL (HTTPS)"
        icon={Icon.Link}
        content={`${repository.html_url}.git`}
        shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
      />
      <Action.CopyToClipboard
        title="Copy Repository URL"
        icon={Icon.CopyClipboard}
        content={repository.html_url}
      />

      <ActionPanel.Section title="GitHub">
        <Action
          title={starred ? "Unstar Repository" : "Star Repository"}
          icon={starred ? Icon.StarCircle : Icon.Star}
          shortcut={{ modifiers: ["cmd"], key: "s" }}
          onAction={toggleStar}
        />
      </ActionPanel.Section>

      {editorConfigured ? (
        <ActionPanel.Section title="Local">
          <Action.ShowInFinder title="Show in File Browser" path={localPath} select={false} />
          <Action.RunInTerminal
            title="Open Terminal Here"
            args={[]}
            options={{ workingDirectory: localPath, hold: true }}
            icon={Icon.Terminal}
          />
        </ActionPanel.Section>
      ) : null}
    </ActionPanel>
  );
}
