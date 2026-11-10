/** Wrap a value so `sh -c` sees it as one word, whatever it contains. */
export function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}
