/**
 * Split a config value into argv the way the shell yt-x itself uses would.
 *
 * yt-x passes `CONFIG_MPV_ARGS` and friends through unquoted word splitting, so
 * `--vf crop=100:100` becomes two arguments there. Splitting on whitespace alone
 * would do the same, but would also break `--title="a b"`, which the shell keeps
 * as one word.
 */
export function splitWords(value: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;

    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
        continue;
      }
      // Inside double quotes a backslash only escapes the four characters a
      // POSIX shell treat as special there.
      if (char === "\\" && index + 1 < value.length) {
        const next = value[index + 1]!;
        if (next === '"' || next === "\\" || next === "$" || next === "`") {
          word += next;
          index++;
          continue;
        }
      }
      word += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }

    if (char === "\\" && index + 1 < value.length) {
      word += value[index + 1]!;
      started = true;
      index++;
      continue;
    }

    if (/\s/.test(char)) {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
      continue;
    }

    word += char;
    started = true;
  }

  if (started) words.push(word);
  return words;
}
