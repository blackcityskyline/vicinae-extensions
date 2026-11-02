export interface Category {
  key: string;
  title: string;
  /** Every type the category sets together; the first one is the one shown. */
  mimes: readonly string[];
  /**
   * Menu categories an application must declare to be offered. Without it any
   * application that handles one of the types qualifies.
   */
  desktopCategories?: readonly string[];
}

export const CATEGORIES = [
  { key: "browser", title: "Web Browser", mimes: ["x-scheme-handler/http", "x-scheme-handler/https"] },
  { key: "mail", title: "Mail", mimes: ["x-scheme-handler/mailto"], desktopCategories: ["Email"] },
  { key: "calendar", title: "Calendar", mimes: ["text/calendar", "x-scheme-handler/webcal"], desktopCategories: ["Calendar"] },
  { key: "files", title: "File Manager", mimes: ["inode/directory"], desktopCategories: ["FileManager"] },
  { key: "music", title: "Music", mimes: ["audio/mpeg", "audio/flac", "audio/ogg", "audio/x-wav"], desktopCategories: ["Audio", "Music", "Player"] },
  { key: "video", title: "Video", mimes: ["video/mp4", "video/x-matroska", "video/webm"], desktopCategories: ["Video", "Player"] },
  { key: "photos", title: "Images", mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"], desktopCategories: ["Graphics", "2DGraphics", "Viewer"] },
  { key: "editor", title: "Text Editor", mimes: ["text/plain"], desktopCategories: ["TextEditor"] },
  { key: "pdf", title: "PDF Viewer", mimes: ["application/pdf"], desktopCategories: ["Viewer", "Office"] },
  { key: "archive", title: "Archive Manager", mimes: ["application/zip", "application/x-tar", "application/x-7z-compressed", "application/x-xz", "application/vnd.rar"], desktopCategories: ["Archiver", "Compression"] },
  { key: "word", title: "Word Processor", mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/vnd.oasis.opendocument.text"], desktopCategories: ["Office", "WordProcessor"] },
  { key: "torrent", title: "Torrent", mimes: ["application/x-bittorrent", "x-scheme-handler/magnet"], desktopCategories: ["P2P", "FileTransfer"] },
] as const satisfies readonly Category[];

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
