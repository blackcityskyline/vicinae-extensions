import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  getPreferenceValues,
  Icon,
  Keyboard,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";

import * as mail from "~/api/mail";
import { attempt, useMailbox } from "~/hooks/use-mailbox";
import Message from "~/message";
import NewAddress from "~/new-address";
import { senderLabel } from "~/utils/seen";
import { absoluteTime, formatCountdown, relativeTime } from "~/utils/when";

/** The two lifetimes upstream offers, and the only two it offers. */
const LIFETIMES = [10, 30];

/** Upstream's own clamping: a nonsensical preference cannot break the view. */
function minutes(value: string | undefined, fallback: number): number {
  const parsed = Number(value) || fallback;
  return Math.max(1, Math.min(30, parsed));
}

export default function Mailbox() {
  const { pollInterval, defaultDuration, extendMinutes } = getPreferenceValues<Preferences>();
  const { pop } = useNavigation();
  const { address, expiresAt, messages, unread, error, isLoading, now, reload } = useMailbox(Number(pollInterval) || 0);

  const chosen = Number(defaultDuration) === 30 ? 30 : 10;
  const extendBy = minutes(extendMinutes, 10);
  const msLeft = Math.max(0, expiresAt - now);
  const counting = expiresAt > 0;
  const pollSeconds = Number(pollInterval) || 0;

  const addressPicker = (
    <Action.Push
      title="Choose an Address"
      icon={Icon.PlusCircle}
      target={<NewAddress onDone={async () => { await reload(); pop(); }} />}
    />
  );

  async function create(lifetime: number): Promise<void> {
    await attempt(async () => {
      const domain = (await mail.domains())[0];
      if (!domain) throw new Error("mail.tm did not offer any domain.");
      // `register` deletes the current account first, as upstream's helper does.
      await mail.create(domain, lifetime);
      await reload();
    });
  }

  async function replace(lifetime: number): Promise<void> {
    const confirmed = await confirmAlert({
      title: "Throw Away the Current Address?",
      message: "It is deleted on mail.tm and everything in it goes with it.",
      primaryAction: { title: `Get a ${lifetime}-Minute Address`, style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });

    if (!confirmed) return;

    await create(lifetime);
  }

  async function dropAddress(): Promise<void> {
    const confirmed = await confirmAlert({
      title: "Throw Away This Address?",
      message: `${address} is deleted on mail.tm and everything in it goes with it.`,
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });

    if (!confirmed) return;

    await attempt(async () => {
      await mail.unregister();
      await reload();
    });
  }

  async function extend(): Promise<void> {
    await attempt(async () => {
      const updated = await mail.extend(extendBy);
      await reload();
      await showToast({
        style: Toast.Style.Success,
        title: `Extended by ${extendBy} minutes`,
        message: `expires at ${absoluteTime(updated.expiresAt)} — ${formatCountdown(Math.max(0, updated.expiresAt - Date.now()))} left`,
      });
    });
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search sender or subject">
      <List.Section title="Address">
        {address ? (
          <List.Item
            icon={{ source: Icon.Envelope }}
            title={address}
            subtitle={error ?? (counting ? `expires in ${formatCountdown(msLeft)}` : "this address has no lifetime set")}
            keywords={[address]}
            accessories={[
              { text: counting ? formatCountdown(msLeft) : "no lifetime", tooltip: "Time left" },
              ...(unread > 0 ? [{ tag: { value: `${unread} new`, color: "yellow" }, tooltip: "Unread mail" }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy Address"
                  content={address}
                  icon={Icon.Envelope}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                />
                <Action title={`Extend by ${extendBy} Minutes`} icon={Icon.Hourglass} onAction={() => void extend()} />
                <ActionPanel.Section title="Replace">
                  {LIFETIMES.map((lifetime) => (
                    <Action
                      key={lifetime}
                      title={`Replace With a ${lifetime}-Minute Address`}
                      icon={lifetime === chosen ? Icon.Checkmark : Icon.Wand}
                      onAction={() => void replace(lifetime)}
                    />
                  ))}
                  {addressPicker}
                </ActionPanel.Section>
                <ActionPanel.Section title="Danger zone">
                  <Action
                    title="Throw Away This Address"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd"], key: "backspace" }}
                    onAction={() => void dropAddress()}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ) : (
          LIFETIMES.map((lifetime) => (
            <List.Item
              key={lifetime}
              icon={{ source: Icon.Wand }}
              title={`Create a ${lifetime}-minute address`}
              subtitle={
                lifetime === chosen
                  ? "Your default lifetime, from the extension's settings"
                  : "Longer, for a signup that takes its time"
              }
              keywords={["new", "address", String(lifetime)]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Create a ${lifetime}-minute address`}
                    icon={Icon.Wand}
                    shortcut={lifetime === chosen ? Keyboard.Shortcut.Common.New : undefined}
                    onAction={() => void create(lifetime)}
                  />
                </ActionPanel>
              }
            />
          ))
        )}

        {!address && addressPicker}

        {address && (
          <List.Item
            icon={{ source: Icon.ArrowClockwise }}
            title="Refresh"
            subtitle={
              pollSeconds > 0
                ? `mail.tm, checked every ${pollSeconds} s while this is open`
                : "mail.tm, checked only when you ask"
            }
            keywords={["poll", "check", "reload"]}
            actions={
              <ActionPanel>
                <Action
                  title="Refresh Now"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={() => void reload()}
                />
              </ActionPanel>
            }
          />
        )}
      </List.Section>

      <List.Section title={messages.length === 0 ? "Inbox" : `Inbox (${messages.length})`}>
        {messages.length === 0 && !isLoading && (
          <List.Item
            icon={Icon.Ellipsis}
            title={address ? "Nothing here yet" : "No inbox to read"}
            subtitle={
              address
                ? `Waiting for mail${pollSeconds > 0 ? ` — checks every ${pollSeconds} s` : ""}`
                : "Make an address above and mail lands here"
            }
          />
        )}

        {messages.map((item) => (
          <List.Item
            key={item.id}
            icon={{ source: Icon.Envelope, tintColor: item.seen ? undefined : "yellow" }}
            title={item.subject || "(no subject)"}
            subtitle={senderLabel(item.from?.name ?? "", item.from?.address ?? "")}
            keywords={[item.subject, item.from?.name, item.from?.address, item.intro ?? ""]}
            accessories={[
              { text: relativeTime(item.createdAt), tooltip: "Received" },
              ...(item.seen ? [] : [{ tag: { value: "New", color: "yellow" }, tooltip: "Unread" }]),
              ...(item.attachments?.length
                ? [{ tag: { value: String(item.attachments.length), color: "blue" }, icon: Icon.Paperclip, tooltip: "Attachments" }]
                : []),
            ]}
            actions={
              <ActionPanel>
                <Action.Push title="Read" icon={Icon.Eye} target={<Message id={item.id} />} />
                {item.from?.address && (
                  <Action.CopyToClipboard title="Copy Sender Address" content={item.from.address} icon={Icon.Envelope} />
                )}
                <ActionPanel.Section title="Modify">
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={() =>
                      void attempt(async () => {
                        await mail.remove(item.id);
                        await reload();
                      })
                    }
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="About">
        <List.Item
          icon={Icon.Bell}
          title="Notifications come from Check For Mail"
          subtitle="Every minute, in the background: says who sent new mail and throws away an address whose time is up"
          keywords={["background", "notify", "interval"]}
          actions={
            <ActionPanel>
              <Action title="Change Notification Settings" icon={Icon.Cog} onAction={() => void openExtensionPreferences()} />
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.Globe01}
          title="Powered by mail.tm"
          subtitle="The API behind this extension; the attribution it asks for"
          keywords={["attribution", "mail.tm"]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open mail.tm" url="https://mail.tm" icon={Icon.Globe01} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
