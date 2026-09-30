import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Editor and clone-path resolution. Pure on purpose: this module must stay
 * importable without the Vicinae runtime, because `test/format.test.ts` checks
 * it headlessly and anything importing `@vicinae/api` throws there
 * (`getGlobal()` returns undefined). Launching the editor lives in
 * `src/api/open-repository.ts` for the same reason.
 */

/**
 * Linux has no `open -a`, so the upstream extension's hardcoded
 * `/Applications/Visual Studio Code.app` cannot work here. The editor is chosen
 * in preferences and launched by binary name instead.
 */
export const EDITOR_COMMANDS = {
  code: "code",
  cursor: "cursor",
  codium: "codium",
  windsurf: "windsurf",
  zed: "zed",
  idea: "idea",
} as const;

export const INSTALL_HINTS: Record<keyof typeof EDITOR_COMMANDS, string> = {
  code: "Install Visual Studio Code, or pick a different editor in preferences.",
  cursor: "Install Cursor, or pick a different editor in preferences.",
  codium: "Install VSCodium, or pick a different editor in preferences.",
  windsurf: "Install Windsurf, or pick a different editor in preferences.",
  zed: "Install Zed, or pick a different editor in preferences.",
  idea: "Install IntelliJ IDEA, or pick a different editor in preferences.",
};

export function isSupportedEditor(value: string | undefined): value is keyof typeof EDITOR_COMMANDS {
  return value !== undefined && value !== "none" && value in EDITOR_COMMANDS;
}

export function editorBinary(editor: string): string | undefined {
  return isSupportedEditor(editor) ? EDITOR_COMMANDS[editor] : undefined;
}

/** Expand a leading `~`, since preferences are typed by hand. */
export function expandHome(input: string, home: string = homedir()): string {
  const trimmed = input.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return join(home, trimmed.slice(2));
  return trimmed;
}

/** Where a repository is cloned to. */
export function clonePathFor(root: string, nameWithOwner: string, home: string = homedir()): string {
  const expanded = expandHome(root, home);
  const parts = nameWithOwner.split("/");
  return expanded === "" ? parts.join("/") : join(expanded, ...parts);
}

export function httpsCloneUrl(htmlUrl: string): string {
  return `${htmlUrl.replace(/\.git$/, "")}.git`;
}
