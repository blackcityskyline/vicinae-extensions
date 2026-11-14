/** `2026-11-13 23:48`: a row-sized timestamp that still sorts. */
export function formatMoment(ms: number): string {
  return new Date(ms).toLocaleString("sv-SE").slice(0, 16);
}
