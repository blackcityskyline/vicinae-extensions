import { Action, ActionPanel, List, open, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo, useState } from "react";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationThreadRead,
} from "~/api/github";
import type { Notification } from "~/api/github";
import ListEmptyView from "~/components/ListEmptyView";
import { relativeTime } from "~/utils/format";
import { Icon } from "~/utils/icons";

const SUBJECT_ICON: Record<string, (typeof Icon)[keyof typeof Icon]> = {
  Issue: Icon.Exclamationmark,
  PullRequest: Icon.Git,
  Discussion: Icon.Message,
  Release: Icon.Tag,
  RepositoryVulnerabilityAlert: Icon.Warning,
  CheckSuite: Icon.CheckRosette,
};

function subjectIcon(notification: Notification) {
  return SUBJECT_ICON[notification.subject.type] ?? Icon.Bubble;
}

function reason(notification: Notification): string {
  return notification.reason.replace(/^_+/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * The notification inbox.
 *
 * Marking a thread read is the action that matters, because it is the only one
 * that changes GitHub's own unread badge; it is bound to a shortcut so the inbox
 * can be cleared without leaving the keyboard.
 *
 * The unread/all switch is not decoration. `GET /notifications` returns unread
 * threads only unless `all=true`, so on a real account the default view showed
 * "Inbox zero" while `all=true` returned three threads. Without the switch the
 * command looks broken on an account that simply has nothing unread.
 */
export default function Notifications() {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, mutate, pagination } = useCachedPromise(
    (includeRead: boolean) => async (options: { page: number }) => {
      const items = await listNotifications(options.page + 1, includeRead);
      return { data: items, hasMore: items.length > 0 };
    },
    [showAll],
    { keepPreviousData: true },
  );

  const notifications = useMemo(() => data ?? [], [data]);
  const unread = notifications.filter((notification) => notification.unread).length;

  async function markRead(notification: Notification) {
    await markNotificationThreadRead(notification.id);
    await mutate();
  }

  return (
    <List
      isLoading={isLoading}
      pagination={pagination}
      searchBarAccessory={
        <List.Dropdown tooltip="Show" storeValue value={showAll ? "all" : "unread"} onChange={(value) => setShowAll(value === "all")}>
          <List.Dropdown.Item title="Unread Only" value="unread" icon={Icon.Bubble} />
          <List.Dropdown.Item title="All Notifications" value="all" icon={Icon.CheckList} />
        </List.Dropdown>
      }
    >
      {notifications.length > 0 ? (
        <List.Section
          title={showAll ? "All Notifications" : "Unread Notifications"}
          subtitle={showAll ? String(notifications.length) : unread > 0 ? `${unread} unread` : "nothing unread"}
        >
          {notifications.map((notification) => (
            <List.Item
              key={notification.id}
              title={notification.subject.title}
              subtitle={`${notification.repository.full_name} · ${reason(notification)} · ${relativeTime(notification.updated_at)}`}
              keywords={[notification.repository.full_name, notification.subject.type, reason(notification)]}
              icon={subjectIcon(notification)}
              accessories={notification.unread ? [{ text: "Unread", tooltip: "Unread" }] : []}
              actions={
                <ActionPanel>
                  {notification.subject.url ? (
                    <Action
                      title="Open on GitHub"
                      icon={Icon.Globe}
                      onAction={async () => {
                        await open(notification.subject.url as string);
                      }}
                    />
                  ) : null}

                  {notification.unread ? (
                    <Action
                      title="Mark as Read"
                      icon={Icon.Check}
                      shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                      onAction={async () => {
                        await markRead(notification);
                      }}
                    />
                  ) : null}

                  <Action.CopyToClipboard
                    title="Copy Repository"
                    icon={Icon.CopyClipboard}
                    content={notification.repository.full_name}
                  />
                  <Action.CopyToClipboard
                    title="Copy Title"
                    icon={Icon.Text}
                    content={notification.subject.title}
                  />

                  <ActionPanel.Section title="Inbox">
                    <Action
                      title="Mark All as Read"
                      icon={Icon.Check}
                      shortcut={{ modifiers: ["cmd", "shift"], key: "backspace" }}
                      onAction={async () => {
                        try {
                          await markAllNotificationsRead();
                          await mutate();
                          await showToast({
                            title: "All notifications marked read",
                            style: Toast.Style.Success,
                          });
                        } catch (markError) {
                          await showToast({
                            title: (markError as Error).message,
                            style: Toast.Style.Failure,
                          });
                        }
                      }}
                    />
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : (
        <ListEmptyView
          isLoading={isLoading}
          error={error}
          icon={Icon.CheckCircle}
          title={showAll ? "No notifications at all" : "Nothing unread"}
          description={
            showAll
              ? "GitHub has no notifications for this account. Mentions, review requests and CI failures land here."
              : "Every notification has been read. Switch the dropdown to All Notifications to see them anyway."
          }
        />
      )}
    </List>
  );
}
