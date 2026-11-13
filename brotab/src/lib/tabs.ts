export type Tab = {
  /**
   * brotab's id: a letter for the mediator, the browser window, the tab —
   * `a.1.17`. The letter is what tells us which port to send the action to.
   */
  id: string;
  title: string;
  url: string;
  /** Discarded by the browser: its contents are gone, the tab strip still shows it. */
  unloaded?: boolean;
};

/** brotab's own range: `DEFAULT_MIN_HTTP_PORT` up, one port per browser. */
export const DEFAULT_PORTS = Array.from({ length: 11 }, (_, index) => 4625 + index);

/**
 * `brotab list` prints one tab per line as `id \t title \t url`, where the id is
 * `window.tab` and the mediator's letter is prepended by the CLI. The HTTP
 * endpoint speaks the same line format without the letter, so this puts it back.
 *
 * Lines that do not carry all three fields are dropped rather than guessed at.
 */
export function parseTabs(stdout: string, letter: string): Tab[] {
  const tabs: Tab[] = [];

  for (const line of stdout.split("\n")) {
    const [rawId, title, url] = line.split("\t");
    const id = rawId?.trim();
    const tabTitle = title?.trim();
    const tabUrl = url?.trim();
    if (!id || !tabTitle || !tabUrl) continue;
    tabs.push({ id: `${letter}.${id}`, title: tabTitle, url: tabUrl });
  }

  return tabs;
}

/**
 * `a.1.17` → `17`. The mediator's `/activate_tab` and `/close_tabs` take the tab
 * alone and call `int()` on it; passing `1.17` raises ValueError through the
 * Flask handler, the mediator shuts itself down, and the browser never respawns
 * it. The window is implied by which window the tab id came from.
 */
export function tabNumber(id: string): string {
  return id.split(".").pop() ?? id;
}

/** `a` → 4625, the letter brotab gives the first mediator it finds. */
export function portFor(id: string, ports: number[]): number | undefined {
  const letter = id.charAt(0);
  return ports[letter.charCodeAt(0) - 97];
}
