import { runInTerminal } from "@vicinae/api";

/**
 * Vicinae owns the terminal: `runInTerminal` follows `xdg-terminal-exec`, and it
 * was measured working here with neither that helper nor `TERMINAL` set.
 * Upstream's iTerm2, Ghostty, kitty, Alacritty, WezTerm and Terminal.app matrix
 * is not needed.
 */
export async function openInNvim(nvim: string, args: string[], directory?: string): Promise<void> {
  await runInTerminal([nvim, ...args], { title: "Neovim", workingDirectory: directory });
}
