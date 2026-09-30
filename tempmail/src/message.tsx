import { Action, ActionPanel, Detail, Icon, List, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";

import { saveAttachment, saveRaw } from "~/api/files";
import * as mail from "~/api/mail";
import { attempt } from "~/hooks/use-mailbox";
import { toMarkdown, type MailAttachment, type MailMessage } from "~/utils/body";
import { absoluteTime, relativeTime, remainingTime } from "~/utils/when";

/**
 * An attachment is fetched when it is asked for, not when the message opens.
 * Every fetch is a request and the API allows thirty a minute, so opening a mail
 * with five attachments must not spend five of them.
 */
function AttachmentRow({ attachment }: { attachment: MailAttachment }) {
  const [path, setPath] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const size = Math.max(1, Math.round(attachment.size / 1024));

  return (
    <List.Item
      icon={{ source: Icon.Paperclip, tintColor: failed ? "red" : undefined }}
      title={attachment.filename}
      subtitle={path ?? (failed ? "Download failed" : `${attachment.contentType} · ${size} KB`)}
      accessories={path ? [{ text: `${size} KB` }] : undefined}
      detail={
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="Type" text={attachment.contentType} />
              <List.Item.Detail.Metadata.Label title="Size" text={`${size} KB`} />
              {path && <List.Item.Detail.Metadata.Label title="Saved to" text={path} />}
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          {path ? (
            <>
              <Action.Open title="Open Attachment" icon={Icon.Eye} target={path} />
              <Action.ShowInFinder title="Show in File Manager" icon={Icon.Finder} path={path} select />
              <Action.CopyToClipboard title="Copy Path" content={path} />
            </>
          ) : (
            <Action
              title="Download Attachment"
              icon={Icon.Download}
              onAction={() =>
                void attempt(async () => {
                  const data = await mail.raw(attachment.downloadUrl);
                  setPath(await saveAttachment(attachment.id, attachment.filename, data));
                }).catch(() => setFailed(true))
              }
            />
          )}
        </ActionPanel>
      }
    />
  );
}

export default function Message({ id }: { id: string }) {
  const [message, setMessage] = useState<MailMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) return <Detail markdown={`# Could not read this message\n\n${error}`} />;
  if (!message) return <Detail markdown="Loading…" />;

  const markdown = toMarkdown(message);
  const recipients = [...(message.to ?? []), ...(message.cc ?? []), ...(message.bcc ?? [])];

  return (
    <List isShowingDetail>
      <List.Item
        title="Message"
        keywords={[message.subject, message.from.address, message.from.name]}
        detail={<List.Item.Detail markdown={markdown} />}
        accessories={message.subject ? [{ tag: message.subject, icon: Icon.BullsEye, tooltip: "Subject" }] : undefined}
        actions={
          <ActionPanel>
            <Action.Push title="View Full Screen" icon={Icon.Eye} target={<Detail markdown={markdown} />} />
            <ActionPanel.Section title="Save">
              <Action
                title="Save as .eml"
                icon={Icon.Download}
                onAction={() =>
                  void attempt(async () => {
                    const path = await saveRaw(message.id, await mail.raw(message.downloadUrl));
                    await showToast({ style: Toast.Style.Success, title: "Saved", message: path });
                  })
                }
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />

      <List.Item
        title="Details"
        detail={
          <List.Item.Detail
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="From" text={`${message.from.name} <${message.from.address}>`} />
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
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          <ActionPanel>
            <Action.CopyToClipboard title="Copy Sender Address" content={message.from.address} icon={Icon.Envelope} />
            {message.from.name && (
              <Action.CopyToClipboard title="Copy Sender Name" content={message.from.name} icon={Icon.PersonCircle} />
            )}
          </ActionPanel>
        }
      />

      {(message.attachments ?? []).map((attachment) => (
        <AttachmentRow key={attachment.id} attachment={attachment} />
      ))}
    </List>
  );
}
