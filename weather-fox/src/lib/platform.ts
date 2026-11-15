// Platform-dependent copy. Shortcuts themselves are declared on each Action;
// this covers the places where a shortcut is *written out* for the user (error
// hints, README-style labels), which the manifest can't translate.

/** Pick the human-readable form of a shortcut for the current platform, e.g. keys("⌘R", "Ctrl+R"). */
export function keys(macOS: string, other: string): string {
  return process.platform === "darwin" ? macOS : other;
}

/** Suffix for error states whose action panel has Keyboard.Shortcut.Common.Refresh bound. */
export const RETRY_HINT = `Press ${keys("⌘R", "Ctrl+R")} to retry.`;
