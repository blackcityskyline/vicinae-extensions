/**
 * Split a config value into argv the way a shell would, so
 * `--title="a b"` survives as one word and `--vf crop=100:100` as two.
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
