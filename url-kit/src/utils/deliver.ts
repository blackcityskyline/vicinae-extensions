export type Output = "copy" | "paste";

/** The window and clipboard operations a result needs, so their order can be checked. */
export type DeliveryIo = {
  copy: (text: string) => Promise<void>;
  paste: (text: string) => Promise<void>;
  closeWindow: () => Promise<void>;
  backToRoot: () => Promise<void>;
};

/**
 * Hands a result to the user: onto the clipboard, or into the window they came from.
 *
 * Pasting closes the window first. The other way round the form still holds focus and
 * the text lands in it. Vicinae's own `Action.Paste` orders it this way, with the
 * comment "we close before pasting to make sure focus has been properly restored".
 */
export async function deliver(result: string, output: Output, io: DeliveryIo): Promise<void> {
  if (output === "paste") {
    await io.closeWindow();
    await io.paste(result);
    return;
  }
  await io.copy(result);
  await io.backToRoot();
}
