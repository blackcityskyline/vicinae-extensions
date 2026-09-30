import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";

import * as mail from "~/api/mail";
import { attempt, useMailbox } from "~/hooks/use-mailbox";
import Message from "~/message";
import NewAddress from "~/new-address";
import { relativeTime } from "~/utils/when";

const EXPIRY_CHOICES = [
  { minutes: 0, title: "Never" },
  { minutes: 5, title: "After 5 minutes" },
  { minutes: 30, title: "After 30 minutes" },
  { minutes: 60, title: "After an hour" },
  { minutes: 720, title: "After 12 hours" },
  { minutes: 1440, title: "After a day" },
  { minutes: 10080, title: "After a week" },
];

export default function Mailbox() {
  const { pollInterval } = getPreferenceValues<Preferences>();
  const { pop } = useNavigation();
  const { address, messages, error, isLoading, reload } = useMailbox(Number(pollInterval) || 0);

  // Re-read whenever the address changes, because throwing one away and getting
  // a new one is exactly when the expiry moves.
  const [expiresAfter, setExpiresAfter] = useState(0);
  useEffect(() => {
    void mail.expiryMinutes().then(setExpiresAfter);
  }, [address]);

  async function replaceAddress(): Promise<void> {
    const domain = (await mail.domains())[0];
    if (!domain) throw new Error("mail.tm did not offer any domain.");
    await mail.unregister();
    await mail.registerRandom(domain);
  }

  async function generateNew(): Promise<void> {
    const confirmed = await confirmAlert({
      title: "Throw Away the Current Address?",
      message: "It is deleted on mail.tm and everything in it goes with it.",
      primaryAction: { title: "Generate", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Cancel" },
    });

    if (!confirmed) return;

    await attempt(async () => {
      await replaceAddress();
      await reload();
    });
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search sender or subject">
      <List.Section title="Address">
        <List.Item
          icon={{ source: Icon.Envelope }}
          title={address || "No address yet"}
          subtitle={error ?? undefined}
          accessories={address ? [{ text: `Throw away: ${expiresAfter ? `${expiresAfter} min idle` : "never"}` }] : undefined}
          keywords={[address]}
          actions={
            <ActionPanel>
              {address && <Action.CopyToClipboard title="Copy Address" content={address} icon={Icon.Envelope} />}
              <Action
                title="Generate a Random Address"
                icon={Icon.Wand}
                onAction={() => void generateNew()}
              />
              <Action.Push
                title="Choose an Address"
                icon={Icon.PlusCircle}
                target={<NewAddress onDone={async () => { await reload(); pop(); }} />}
              />
              <ActionPanel.Submenu title="Throw Away After…" icon={Icon.Hourglass}>
                {EXPIRY_CHOICES.map((choice) => (
                  <Action
                    key={choice.minutes}
                    title={choice.title}
                    icon={expiresAfter === choice.minutes ? Icon.Checkmark : undefined}
                    onAction={() => void attempt(() => mail.setExpiryMinutes(choice.minutes))}
                  />
                ))}
              </ActionPanel.Submenu>
            </ActionPanel>
          }
        />
        <List.Item
          icon={{ source: Icon.ArrowClockwise }}
          title="Refresh"
          subtitle={`mail.tm, checked every ${Number(pollInterval) || "never"}s`}
          actions={
            <ActionPanel>
              <Action title="Refresh Now" icon={Icon.ArrowClockwise} onAction={() => void reload()} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title={messages.length === 0 ? "Inbox" : `Inbox (${messages.length})`}>
        {messages.length === 0 && !isLoading && (
          <List.Item icon={Icon.Ellipsis} title="Nothing here yet" subtitle="Mail shows up on its own" />
        )}

        {messages.map((item) => (
          <List.Item
            key={item.id}
            icon={{ source: Icon.Envelope, tintColor: item.seen ? undefined : "yellow" }}
            title={item.subject || "(no subject)"}
            subtitle={item.from.name || item.from.address}
            keywords={[item.subject, item.from.name, item.from.address, item.intro ?? ""]}
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
                {item.from.address && (
                  <Action.CopyToClipboard title="Copy Sender Address" content={item.from.address} icon={Icon.Envelope} />
                )}
                <ActionPanel.Section title="Modify">
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["cmd"], key: "backspace" }}
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
    </List>
  );
}
