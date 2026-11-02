export const CATEGORIES = [
  { key: "browser", glyph: "Globe01", mimes: ["x-scheme-handler/http", "x-scheme-handler/https"], title: "Web Browser" },
  { key: "mail", glyph: "Envelope", mimes: ["x-scheme-handler/mailto"], categories: ["Email"], title: "Mail" },
  { key: "calendar", glyph: "Calendar", mimes: ["text/calendar", "x-scheme-handler/webcal"], categories: ["Calendar"], title: "Calendar" },
  { key: "files", glyph: "Folder", mimes: ["inode/directory"], categories: ["FileManager"], title: "File Manager" },
  { key: "music", glyph: "SpeakerHigh", mimes: ["audio/mpeg", "audio/flac", "audio/ogg", "audio/x-wav"], categories: ["Audio", "Music", "Player"], title: "Music" },
  { key: "video", glyph: "Video", mimes: ["video/mp4", "video/x-matroska", "video/webm"], categories: ["Video", "Player"], title: "Video" },
  { key: "photos", glyph: "Image", mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"], categories: ["Graphics", "2DGraphics", "Viewer"], title: "Images" },
  { key: "editor", glyph: "Text", mimes: ["text/plain"], categories: ["TextEditor"], title: "Text Editor" },
  { key: "pdf", glyph: "Document", mimes: ["application/pdf"], categories: ["Viewer", "Office"], title: "PDF Viewer" },
  { key: "archive", glyph: "Folder", mimes: ["application/zip", "application/x-tar", "application/x-7z-compressed", "application/x-xz", "application/vnd.rar"], categories: ["Archiver", "Compression"], title: "Archive Manager" },
  { key: "word", glyph: "Document", mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/vnd.oasis.opendocument.text"], categories: ["Office", "WordProcessor"], title: "Word Processor" },
  { key: "torrent", glyph: "Download", mimes: ["application/x-bittorrent", "x-scheme-handler/magnet"], categories: ["P2P", "FileTransfer"], title: "Torrent" },
];

export const SCAN_DIRS = [
  "~/.local/share/applications",
  "/usr/local/share/applications",
  "/usr/share/applications",
  "~/.local/share/flatpak/exports/share/applications",
  "/var/lib/flatpak/exports/share/applications",
];

export type DesktopApp = {
  id: string;
  name: string;
  mimes: Set<string>;
  categories: Set<string>;
  hidden: boolean;
};

export function parseDesktopFile(text: string): DesktopApp {
  const app: DesktopApp = { id: "", name: "", mimes: new Set(), categories: new Set(), hidden: false };
  let inMainEntry = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\[Desktop Entry\]/.test(line)) {
      inMainEntry = true;
      continue;
    }
    if (/^\[/.test(line)) {
      inMainEntry = false;
      continue;
    }
    if (!inMainEntry) continue;
    const m = line.match(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/);
    if (!m || !m[1] || m[2] === undefined) continue;
    const key = m[1];
    const value = m[2];
    if (key === "Name" && app.name === "") {
      app.name = value;
    } else if (key === "Hidden") {
      app.hidden = value === "true";
    } else if (key === "MimeType") {
      for (const mime of value.split(";")) {
        const t = mime.trim();
        if (t) app.mimes.add(t);
      }
    } else if (key === "Categories") {
      for (const cat of value.split(";")) {
        const t = cat.trim();
        if (t) app.categories.add(t);
      }
    }
  }
  return app;
}

export function isCandidateForCategory(app: DesktopApp, cat: (typeof CATEGORIES)[number]): boolean {
  if (cat.key !== "browser" && app.categories.has("WebBrowser")) {
    return false;
  }
  if (!(cat as any).categories) {
    return true;
  }
  const cats = (cat as any).categories as string[];
  for (const c of cats) {
    if (app.categories.has(c)) return true;
  }
  return false;
}

export function getScanDirs(): string[] {
  const dirs: string[] = [];
  const seen = new Set<string>();
  const add = (dir: string) => {
    if (!dir) return;
    if (!seen.has(dir)) {
      seen.add(dir);
      dirs.push(dir);
    }
  };
  for (const d of SCAN_DIRS) add(d);
  return dirs;
}

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return process.env.HOME || "~";
  if (p.startsWith("~/")) return (process.env.HOME || "~") + "/" + p.slice(2);
  return p;
}
