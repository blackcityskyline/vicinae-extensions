/**
 * A stand-in for `@vicinae/api`, for the headless checks only.
 *
 * That package reads the launcher environment while it is being imported and
 * throws outside it, so anything that touches `src/` is unimportable from a
 * plain `tsx` run. This shim is wired in through `tsconfig.json` paths below.
 */

const ICONS = ["BlankDocument", "Pencil", "Clock", "Tag", "Text", "Code", "Link", "Star", "Trash"] as const;

export const Icon: Record<string, string> = Object.fromEntries(ICONS.map((name) => [name, name]));
