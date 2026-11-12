import { Action, ActionPanel, Detail, Icon, Keyboard, List, open, useNavigation } from "@vicinae/api";
import { useEffect, useState } from "react";

import * as mail from "~/api/mail";
import { hasHtml, sandboxedHtml } from "~/api/html";
import { attempt } from "~/hooks/use-mailbox";
import { toMarkdown, type MailMessage } from "~/utils/body";
import { findCodes } from "~/utils/codes";
import { senderLabel } from "~/utils/seen";
import { absoluteTime, relativeTime, remainingTime } from "~/utils/when";

export default function Message({ id }: { id: string }) {
  const { pop } = useNavigation();
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [htmlPath, setHtmlPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void mail
      .message(id)
      .then(async (found) => {
        if (cancelled) return;
        setMessage(found);
        if (!found.seen) await mail.markSeen(id).catch(() => undefined);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not read this message.");
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function openHtml(source: MailMessage): Promise<void> {
    await attempt(async () => {
      const path = await sandboxedHtml(source);
      setHtmlPath(path);
      // A path, not a `file://` URL: measured 2026-11-12, the `file` scheme belongs
      // to `dev.duxlabs.files.desktop` here, so the URL opened the file manager
      // instead of the page. A path is resolved by its type, which is `text/html`.
      await open(path);
    });
  }

  if (error) return <Detail markdown={`# Could not read this message\n\n${error}`} />;
  if (!message) return <Detail markdown="Loading…" />;

  const markdown = toMarkdown(message);
  const recipients = [...(message.to ?? []), ...(message.cc ?? []), ...(message.bcc ?? [])];
  const attachments = message.attachments ?? [];
  const codes = findCodes(message.subject, message.text ?? "", message.verifications);

  return (
    <List isShowingDetail>
      <List.Item
        title="Message"
        keywords={[message.subject, message.from.address, message.from.name]}
        detail={<List.Item.Detail markdown={markdown} />}
        accessories={message.subject ? [{ tag: message.subject, icon: Icon.BullsEye, tooltip: "Subject" }] : undefined}
        actions={
          <ActionPanel>
            <Action.Push title="View Full Screen" shortcut={{ modifiers: ["ctrl"], key: "a" }} icon={Icon.Eye} target={<Detail markdown={markdown} />} />
            {hasHtml(message) && (
              <Action
                title="Open HTML Version"
                icon={Icon.Globe01}
                shortcut={Keyboard.Shortcut.Common.Open}
                onAction={() => void openHtml(message)}
              />
            )}
            {htmlPath && (
              <Action.ShowInFinder
                title="Show the Saved Page"
                shortcut={{ modifiers: ["ctrl"], key: "i" }}
                path={htmlPath}
              />
            )}
          </ActionPanel>
        }
      />

      {codes.map((code) => (
        <List.Item
          key={code}
          icon={{ source: Icon.Key }}
          title={`Code ${code}`}
          subtitle="Found in the mail; copy it before it scrolls away"
          keywords={[code, "otp", "verification"]}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Code"
                content={code}
                icon={Icon.Key}
                // Concealed: a code in the clipboard history is a code anyone with
                // the machine can read back an hour later.
                concealed
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action.Paste title="Paste Code" shortcut="copy" content={code} icon={Icon.Key} />
            </ActionPanel>
          }
        />
      ))}

      <List.Item
        title="Details"
        detail={
          <List.Item.Detail
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label
                  title="From"
                  text={`${senderLabel(message.from.name, message.from.address)} <${message.from.address}>`}
                />
                <List.Item.Detail.Metadata.Separator />
                {recipients.length === 0 ? (
                  <List.Item.Detail.Metadata.Label title="To" text="nobody" />
                ) : (
                  recipients.map((box, index) => (
                    <List.Item.Detail.Metadata.Label
                      key={`${box.address}-${index}`}
                      title={index === 0 ? "To" : ""}
                      text={`${box.name} <${box.address}>`}
                    />
                  ))
                )}
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Label
                  title="Received"
                  text={`${absoluteTime(message.createdAt)} (${relativeTime(message.createdAt)})`}
                />
                {message.retentionDate && (
                  <List.Item.Detail.Metadata.Label
                    title="Deleted in"
                    text={remainingTime(message.retentionDate)}
                    icon={Icon.Trash}
                  />
                )}
                {attachments.length > 0 && (
                  <List.Item.Detail.Metadata.Label
                    title="Attachments"
                    text={`${attachments.map((attachment) => attachment.filename).join(", ")} — open the HTML version to see them`}
                  />
                )}
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Sender Address" shortcut="copy-path" content={message.from.address} icon={Icon.Envelope} />
            {message.from.name && (
              <Action.CopyToClipboard title="Copy Sender Name" shortcut="copy-name" content={message.from.name} icon={Icon.PersonCircle} />
            )}
            <ActionPanel.Section title="Modify">
              <Action
                title="Delete Message"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut="remove"
                onAction={() =>
                  void attempt(async () => {
                    await mail.remove(id);
                    await pop();
                  })
                }
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    </List>
  );
}
