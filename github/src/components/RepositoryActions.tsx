import { Action, ActionPanel, getPreferenceValues, Keyboard, showToast, Toast } from "@vicinae/api";
import { useCachedState } from "@raycast/utils";

import { toggleListed } from "~/api/custom-list";
import { setStarred } from "~/api/github";
import type { Repository } from "~/api/github";
import { cloneAndOpenInEditor } from "~/api/open-repository";
import RepositoryReadme from "~/components/RepositoryReadme";
import { Icon } from "~/utils/icons";
import { clonePathFor, isSupportedEditor } from "~/utils/launch";

/**
 * The action panel for a repository row.
 *
 * Star and list membership are both tracked in `useCachedState` rather than read
 * back from GitHub. REST search has no `viewerHasStarred`, and
 * `GET /user/starred/{owner}/{repo}` needs a scope a read-only token lacks — it
 * answered 403 on a real account, and since `usePromise` turns a rejection into
 * a failure toast, reading it per row would have produced one error popup per
 * repository. Starring is idempotent, so assuming "not starred" on the first
 * press is safe.
 */
export default function RepositoryActions({ repository }: { repository: Repository }) {
  const { defaultEditor, cloneDirectory } = getPreferenceValues<Preferences>();
  const editorConfigured = isSupportedEditor(defaultEditor);
  const localPath = clonePathFor(cloneDirectory, repository.full_name);

  const [starOverrides, setStarOverrides] = useCachedState<Record<number, boolean>>(
    "starred-overrides",
    {},
    { cacheNamespace: "github-starred" },
  );
  const starred = starOverrides[repository.id] ?? false;

  const [listedOverrides, setListedOverrides] = useCachedState<Record<number, boolean>>(
    "listed-overrides",
    {},
    { cacheNamespace: "github-custom-list" },
  );
  const listed = listedOverrides[repository.id] ?? false;

  async function toggleStar() {
    const next = !starred;
    try {
      await setStarred(repository.owner.login, repository.name, next);
    } catch (error) {
      // Almost always a missing scope, so say that rather than showing the raw
      // 403 text.
      await showToast({
        title: "The token cannot star repositories",
        message: `${(error as Error).message} — reissue it with permission to star.`,
        style: Toast.Style.Failure,
      });
      return;
    }

    setStarOverrides({ ...starOverrides, [repository.id]: next });
    await showToast({
      title: next ? `Starred ${repository.name}` : `Unstarred ${repository.name}`,
      style: Toast.Style.Success,
    });
  }

  async function toggleCustomList() {
    const next = await toggleListed(repository);
    setListedOverrides({ ...listedOverrides, [repository.id]: next });
    await showToast({
      title: next ? `Added ${repository.name} to your list` : `Removed ${repository.name} from your list`,
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
        <Action.Push
          title="View README"
          icon={Icon.Document}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          target={<RepositoryReadme repository={repository} />}
        />
        <Action
          title={starred ? "Unstar Repository" : "Star Repository"}
          icon={starred ? Icon.StarCircle : Icon.Star}
          shortcut={{ modifiers: ["cmd"], key: "s" }}
          onAction={toggleStar}
        />
        <Action
          title={listed ? "Remove from My List" : "Add to My List"}
          icon={listed ? Icon.MinusCircle : Icon.Plus}
          shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
          onAction={toggleCustomList}
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
