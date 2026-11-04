import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { environment } from "@vicinae/api";

import type { MailMessage } from "~/utils/body";
import { sandboxDocument } from "~/utils/html";
import { MailError, isMessageId } from "~/utils/mail";

/**
 * Where the sandboxed HTML of a message is written. Upstream puts the same files
 * under `$XDG_RUNTIME_DIR/temp-mail` and deletes the directory with the account;
 * this is the extension's own support directory, which Vicinae owns and cleans
 * with the extension.
 */
const directory = (): string => join(environment.supportPath, "html");

/**
 * Write the message's HTML as one inert document and return its path.
 *
 * The id comes from the network, so it is checked before it becomes a filename:
 * a message cannot choose where it is written.
 */
export async function sandboxedHtml(message: MailMessage): Promise<string> {
  const parts = (message.html ?? []).filter((part) => part.trim() !== "");
  if (parts.length === 0) throw new MailError("server", "This message has no HTML version.");
  if (!isMessageId(message.id)) throw new MailError("server", "mail.tm sent a message id this extension cannot use.");

  await mkdir(directory(), { recursive: true });

  const path = join(directory(), `${message.id}.html`);
  await writeFile(path, sandboxDocument(parts), "utf8");

  return path;
}

/** True when the message has an HTML part worth offering to open. */
export function hasHtml(message: MailMessage): boolean {
  return (message.html ?? []).some((part) => part.trim() !== "");
}

/** Every sandboxed page, thrown away with the address that received them. */
export async function clearSandboxedHtml(): Promise<void> {
  await rm(directory(), { recursive: true, force: true });
}
