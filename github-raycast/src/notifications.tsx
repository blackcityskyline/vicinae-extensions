import { Action, ActionPanel, List, open, showToast, Toast } from "@vicinae/api";
import { useCachedPromise } from "@raycast/utils";
import { useMemo } from "react";

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
 */
export default function Notifications() {
  const { data, isLoading, error, mutate, pagination } = useCachedPromise(
    () => async (options: { page: number }) => {
      const items = await listNotifications(options.page + 1);
      return { data: items, hasMore: items.length > 0 };
    },
    [],
    { keepPreviousData: true },
  );

  const notifications = useMemo(() => data ?? [], [data]);
  const unread = notifications.filter((notification) => notification.unread).length;

  async function markRead(notification: Notification) {
    await markNotificationThreadRead(notification.id);
    await mutate();
  }

  return (
    <List isLoading={isLoading} pagination={pagination}>
      {notifications.length > 0 ? (
        <List.Section title="Notifications" subtitle={unread > 0 ? `${unread} unread` : "all read"}>
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
          title="Inbox zero"
          description="You have no notifications. GitHub sends them for mentions, review requests and CI failures."
        />
      )}
    </List>
  );
}
