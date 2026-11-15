import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import * as path from "node:path";

const IMAGE = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".ico",
]);
const MARKDOWN = new Set([".md", ".markdown"]);
const TEXT = new Set([
  ".txt", ".log", ".json", ".jsonc", ".toml", ".yaml", ".yml", ".ini", ".conf",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".html", ".xml",
  ".sh", ".bash", ".zsh", ".fish", ".py", ".rb", ".rs", ".go", ".c", ".h", ".cpp",
  ".hpp", ".java", ".kt", ".lua", ".qml", ".sql", ".diff", ".patch", ".env",
]);
const MAX_TEXT = 64 * 1024;

/**
 * Markdown for the preview pane: an image for image files, the file's own
 * markdown for `.md`, a fenced block for source and text, and a nudge towards
 * Open/Sushi for everything else. Anything over 64 KB is cut, so previewing a
 * log or a video file never reads it whole.
 */
export async function renderPreview(filePath: string): Promise<string> {
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();

  if (IMAGE.has(ext)) {
    return `![${name}](${pathToFileURL(filePath).href})`;
  }
  if (!MARKDOWN.has(ext) && !TEXT.has(ext)) {
    return `## No inline preview\n\n${name} — use **Open** or **Preview in Sushi**.`;
  }

  const buffer = await fs.readFile(filePath);
  const slice = buffer.subarray(0, MAX_TEXT);
  if (slice.includes(0)) {
    return `## Binary file\n\n${name} — use **Open** or **Preview in Sushi**.`;
  }

  const text = slice.toString("utf8");
  const truncated = buffer.length > MAX_TEXT;
  if (MARKDOWN.has(ext)) {
    return truncated ? `${text}\n\n---\n*Truncated at 64 KB*` : text;
  }
  // Four backticks: a fenced block inside ordinary source still renders.
  const body = truncated ? `${text}\n\n… truncated at 64 KB` : text;
  return `\`\`\`\`${ext.replace(".", "")}\n${body}\n\`\`\`\``;
}
