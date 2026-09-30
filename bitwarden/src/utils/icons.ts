import { Icon as VicinaeIcon } from "@vicinae/api";

/**
 * Raycast exposes a handful of icons that Vicinae does not. Declaring the full
 * set once here keeps the Raycast names working at the call sites, mapped onto
 * the closest available Vicinae icon.
 */
export const Icon = {
  ...VicinaeIcon,

  // Raycast name -> closest Vicinae equivalent.
  Clipboard: VicinaeIcon.CopyClipboard,
  Document: VicinaeIcon.BlankDocument,
  ExclamationMark: VicinaeIcon.Warning,
  Globe: VicinaeIcon.Globe01,
  List: VicinaeIcon.CheckList,
  Message: VicinaeIcon.SpeechBubble,
  QuestionMark: VicinaeIcon.QuestionMarkCircle,
  RaycastLogoNeg: VicinaeIcon.Bolt,
  Sidebar: VicinaeIcon.AppWindowSidebarLeft,
  Window: VicinaeIcon.AppWindow,
} as const;

/** Any icon value, used for prop types such as `icon?: Icon`. */
export type Icon = (typeof Icon)[keyof typeof Icon];
