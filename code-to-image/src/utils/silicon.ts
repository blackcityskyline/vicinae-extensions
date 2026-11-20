import type { Choice } from "~/utils/snippet";

/**
 * silicon takes the same identifiers the codetoimage API uses (`-l csharp`,
 * `-l tsx`), so the online and local forms can offer the same language names.
 * Measured 2026-11-20 against silicon 0.5.2: all 37 render.
 */
export const SILICON_LANGUAGES: Choice[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "tsx", label: "TSX" },
  { id: "jsx", label: "JSX" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "swift", label: "Swift" },
  { id: "kotlin", label: "Kotlin" },
  { id: "dart", label: "Dart" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "xml", label: "XML" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Bash" },
  { id: "powershell", label: "PowerShell" },
  { id: "markdown", label: "Markdown" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
  { id: "graphql", label: "GraphQL" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "toml", label: "TOML" },
  { id: "lua", label: "Lua" },
  { id: "r", label: "R" },
  { id: "scala", label: "Scala" },
  { id: "elixir", label: "Elixir" },
  { id: "haskell", label: "Haskell" },
  { id: "zig", label: "Zig" },
];

export function parseThemeList(stdout: string): Choice[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ id: name, label: name }));
}

/** silicon exits 0 even when it refuses a language or theme; stderr is the only sign. */
export function siliconErrorMessage(stderr: string): string {
  const detail = stderr
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\[error\]\s*/i, ""))
    .filter(Boolean)
    .join(" ");
  return detail || "silicon produced no image.";
}
