import type { Keyboard } from "@vicinae/api";

export const detailsShortcut: Keyboard.Shortcut = {
  modifiers: ["shift"],
  key: "i",
};

export const outputShortcuts = {
  testSound: { modifiers: ["ctrl"], key: "t" },
  reconnect: { modifiers: ["ctrl", "shift"], key: "r" },
  group: { modifiers: ["ctrl"], key: "g" },
  ungroup: { modifiers: ["ctrl"], key: "x" },
  applyPreset: { modifiers: ["ctrl"], key: "p" },
  savePreset: { modifiers: ["ctrl"], key: "s" },
  setDefault: { modifiers: ["ctrl"], key: "d" },
  mute: { modifiers: ["ctrl"], key: "m" },
  volumeUp: { modifiers: ["ctrl"], key: "arrowUp" },
  volumeDown: { modifiers: ["ctrl"], key: "arrowDown" },
  setVolume: { modifiers: ["ctrl", "shift"], key: "v" },
} satisfies Record<string, Keyboard.Shortcut>;

export const presetShortcuts = {
  apply: { modifiers: ["ctrl"], key: "enter" },
} satisfies Record<string, Keyboard.Shortcut>;
