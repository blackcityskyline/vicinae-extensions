import { Icon as VicinaeIcon } from "@vicinae/api";

/**
 * Vicinae has no `Bubble`, `Cog`, `Document`, `Gear`, `Globe`, `Info`, `List`,
 * `QuestionMark` or `Sidebar`. Declaring the Raycast names once here keeps the
 * rest of the code reading like the upstream extension while rendering a real
 * icon. Verified against `@vicinae/api` 0.29.0.
 */
export const Icon = {
  ...VicinaeIcon,

  Bubble: VicinaeIcon.SpeechBubble,
  Document: VicinaeIcon.BlankDocument,
  Gear: VicinaeIcon.Cog,
  Globe: VicinaeIcon.Globe01,
  Info: VicinaeIcon.Info01,
  List: VicinaeIcon.CheckList,
  Message: VicinaeIcon.SpeechBubble,
  QuestionMark: VicinaeIcon.QuestionMarkCircle,
  Sidebar: VicinaeIcon.AppWindowSidebarLeft,
} as const;

/** Any icon value, for prop types such as `icon?: Icon`. */
export type Icon = (typeof Icon)[keyof typeof Icon];
