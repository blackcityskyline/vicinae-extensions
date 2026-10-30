import { Clipboard } from "@vicinae/api";

/**
 * The clipboard's text, or "" when it holds none or cannot be read. The runtime
 * can answer with null rather than a string, and a command that reads the
 * clipboard on open must not crash on an empty one.
 */
export async function readClipboardText(): Promise<string> {
  try {
    return (await Clipboard.readText()) ?? "";
  } catch (failure) {
    console.error("Could not read the clipboard", failure);
    return "";
  }
}
