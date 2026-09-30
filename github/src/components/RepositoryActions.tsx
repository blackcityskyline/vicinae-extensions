import { Action, ActionPanel, getPreferenceValues, Keyboard, showToast, Toast } from "@vicinae/api";
import { useCachedState } from "@raycast/utils";

import { setStarred } from "~/api/github";
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

  // Star state is tracked locally rather than read from GitHub.
  //
  // REST search has no `viewerHasStarred`, so the only way to know would be a
  // request per visible row. That is both expensive while arrowing through a
  // list and fragile: `GET /user/starred/{owner}/{repo}` needs a scope that a
  // read-only token does not have, and it answered 403 on a real account, which
  // would have raised a failure toast on every single row.
  //
  // Starring is idempotent, so the first press can safely assume "not starred".
  const [starOverrides, setStarOverrides] = useCachedState<Record<number, boolean>>(
    "starred-overrides",
    {},
    { cacheNamespace: "github-starred" },
  );
  const starred = starOverrides[repository.id] ?? false;

  async function toggleStar() {
    const next = !starred;
    try {
      await setStarred(repository.owner.login, repository.name, next);
    } catch (error) {
      await showToast({ title: (error as Error).message, style: Toast.Style.Failure });
      return;
    }

    setStarOverrides({ ...starOverrides, [repository.id]: next });
    await showToast({
      title: next ? `Starred ${repository.name}` : `Unstarred ${repository.name}`,
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
