import type { KeyEquivalent, KeyModifier, Keyboard } from "@vicinae/api";

/** Vicinae takes one shortcut; `cmd` and `opt` are Raycast's names for ctrl and alt. */
export function shortcut(key: KeyEquivalent, modifiers: KeyModifier[]): Keyboard.Shortcut {
	return {
		key,
		modifiers: modifiers.map((modifier) => (modifier === "cmd" ? "ctrl" : modifier === "opt" ? "alt" : modifier)),
	};
}
