import { Action, ActionPanel, Clipboard, List, open, showToast, Toast } from "@vicinae/api";

import { setItemState } from "~/api/github";
import type { Issue, PullRequest } from "~/api/github";
import { absoluteDate, relativeTime } from "~/utils/format";
import { Icon } from "~/utils/icons";

type Searchable = Issue | PullRequest;

function isPullRequest(item: Searchable): item is PullRequest {
  return "head" in item;
}

/** `https://api.github.com/repos/acme/widget` -> `acme/widget`. */
function repositoryName(item: Searchable): string {
  return item.repository_url.split("/repos/")[1] ?? "";
}

function labelAccessories(item: Searchable): List.Item.Accessory[] {
  return item.labels.slice(0, 3).map((label) => ({
    tag: { value: label.name, color: `#${label.color}` },
    tooltip: "Label",
  }));
}

function stateIcon(item: Searchable) {
  if (item.state === "closed") return Icon.CheckCircle;
  return isPullRequest(item) ? Icon.Git : Icon.Exclamationmark;
}

/**
 * An issue or pull request row.
 *
 * One component serves both because the REST search endpoint returns them
 * together and the only real differences are the icon and the branch names.
 */
export default function IssueListItem({ item }: { item: Searchable }) {
  const repository = repositoryName(item);

  return (
    <List.Item
      title={item.title}
      subtitle={`${repository} #${item.number} · ${item.user?.login ?? "unknown"} · opened ${relativeTime(item.created_at)}`}
      keywords={[repository, item.user?.login ?? "", `#${item.number}`, ...item.labels.map((label) => label.name)]}
      icon={stateIcon(item)}
      accessories={[
        ...labelAccessories(item),
        {
          text: item.comments > 0 ? `${item.comments} comments` : "no comments",
          tooltip: "Comments",
        },
        { text: `updated ${absoluteDate(item.updated_at)}`, tooltip: "Last activity" },
      ]}
      actions={<ItemActions item={item} />}
    />
  );
}

function ItemActions({ item }: { item: Searchable }) {
  const pullRequest = isPullRequest(item);
  const repository = repositoryName(item);

  async function copy(content: string, title: string) {
    await Clipboard.copy(content);
    await showToast({ title, style: Toast.Style.Success });
  }

  async function setState(state: "open" | "closed") {
    const [owner, name] = repository.split("/");
    if (owner === undefined || name === undefined) return;

    await setItemState(owner, name, item.number, state);
    await showToast({
      title: state === "closed" ? `Closed #${item.number}` : `Reopened #${item.number}`,
      style: Toast.Style.Success,
    });
  }

  return (
    <ActionPanel>
      <Action.OpenInBrowser title="Open in Browser" url={item.html_url} />

      <Action.CopyToClipboard
        title="Copy URL"
        icon={Icon.Link}
        content={item.html_url}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
      />
      <Action.CopyToClipboard title="Copy Title" icon={Icon.CopyClipboard} content={item.title} />
      <Action
        title="Copy Reference as Markdown"
        icon={Icon.Text}
        onAction={async () => {
          // A bare `#123` only links back when pasted on GitHub; the full form
          // works anywhere, which is where a copied reference usually lands.
          await copy(
            `${item.title} (#${item.number}) — https://github.com/${repository}/issues/${item.number}`,
            "Copied as Markdown",
          );
        }}
      />

      {pullRequest ? (
        <ActionPanel.Section title="Branches">
          <Action
            title="Copy Head Branch"
            icon={Icon.Git}
            onAction={async () => {
              await copy(item.head.ref, `Copied ${item.head.ref}`);
            }}
          />
          <Action
            title="Copy Checkout Command"
            icon={Icon.Terminal}
            onAction={async () => {
              await copy(`gh pr checkout ${item.number} --repo ${repository}`, "Copied checkout command");
            }}
          />
        </ActionPanel.Section>
      ) : null}

      <ActionPanel.Section title="State">
        {item.state === "open" ? (
          <Action
            title="Close"
            icon={Icon.CheckCircle}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["cmd"], key: "backspace" }}
            onAction={async () => {
              await setState("closed");
            }}
          />
        ) : (
          <Action
            title="Reopen"
            icon={Icon.ArrowClockwise}
            onAction={async () => {
              await setState("open");
            }}
          />
        )}
      </ActionPanel.Section>

      <ActionPanel.Section title="Repository">
        <Action
          title="Open Repository"
          icon={Icon.Bubble}
          onAction={async () => {
            await open(`https://github.com/${repository}`);
          }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}
