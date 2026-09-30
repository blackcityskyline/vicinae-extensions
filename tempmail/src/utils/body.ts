import { NodeHtmlMarkdown } from "node-html-markdown";

export type Mailbox = { name: string; address: string };

export type MailAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  downloadUrl: string;
};

export type MailMessage = {
  id: string;
  subject: string;
  intro?: string;
  /** Plain text, when the sender sent one. Preferred over the html. */
  text?: string;
  html?: string[];
  from: Mailbox;
  to?: Mailbox[];
  cc?: Mailbox[];
  bcc?: Mailbox[];
  seen: boolean;
  createdAt: string;
  retentionDate?: string;
  attachments: MailAttachment[];
  downloadUrl: string;
  size: number;
};

const EMPTY = "_This message has no body._";

/**
 * Inline attachments are referenced from the html as `cid:ATT0001`, which is
 * meaningless outside the mail client. Upstream rewrites them to a local file it
 * has already downloaded; here they become the attachment's name, which is
 * readable and needs nothing fetched.
 */
function nameAttachments(markdown: string, attachments: MailAttachment[]): string {
  return markdown.replace(/cid:(ATT\d{1,6})/gi, (match, id: string) => {
    const attachment = attachments.find((candidate) => candidate.id === id);
    // Unnamed: drop it rather than leave the reference in the text.
    return attachment ? `*${attachment.filename}*` : "";
  });
}

function fromHtml(html: string): string {
  return NodeHtmlMarkdown.translate(
    // A markdown table renders badly in the panel; upstream flattens these too.
    html.replace(/<table/gi, "<div").replace(/<\/table>/gi, "</div>"),
    { keepDataImages: true },
  ).trim();
}

/** The body as markdown for a `Detail`. */
export function toMarkdown(message: MailMessage): string {
  const text = message.text?.trim() ?? "";
  const html = message.html?.find((part) => part.trim()) ?? "";

  let body = "";
  if (text) {
    // Plain text needs no conversion, so it is not put through one.
    body = text;
  } else if (html) {
    body = fromHtml(html);
  }

  body = nameAttachments(body, message.attachments ?? []);

  const heading = message.subject?.trim() ? `# ${message.subject.trim()}\n\n` : "";
  return `${heading}${body || EMPTY}`;
}
