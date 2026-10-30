/**
 * What a command's field starts out holding: the argument when there is one,
 * else the clipboard.
 *
 * An argument can arrive from a script or a deeplink, so it wins over whatever
 * happens to be copied. Both are trimmed, because a deeplink carries what the
 * shell handed it. Neither is validated here: that happens once, where the text
 * is used, so a value the command would have accepted is not rejected by the
 * form with a different message.
 */
export function initialText(argument: string | undefined, clipboard: string | undefined): string {
  const fromArgument = (argument ?? "").trim();
  if (fromArgument) return fromArgument;
  return (clipboard ?? "").trim();
}
