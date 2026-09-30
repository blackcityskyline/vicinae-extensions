/**
 * Timestamps are rendered by hand rather than through `toLocaleString()`.
 *
 * With no locale that gave `3/10/2026, 4:59:12 AM` on this machine: month first
 * and a twelve-hour clock, which a European reader has to stop and re-read. The
 * locale also decides the output, so the same list would look different on a
 * different machine — and the tests could not pin it.
 */
export function formatTimestamp(when: number | undefined): string {
  if (when === undefined) return "—";

  const moment = new Date(when);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${pad(moment.getDate())}.${pad(moment.getMonth() + 1)}`;

  return `${day}.${moment.getFullYear()} ${pad(moment.getHours())}:${pad(moment.getMinutes())}`;
}
