/**
 * Timestamps are formatted by hand rather than through `toLocaleString()`.
 *
 * With no locale that gave `3/10/2026, 4:59:12 AM` on this machine: month first
 * and a twelve-hour clock, which a European reader has to stop and re-read. The
 * locale also decides the output, so the same list looked different on a
 * different machine and no check could pin it. The order is a preference.
 */

export const DATE_FORMATS = ["dotted", "dmy", "mdy", "iso"] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export const DEFAULT_FORMAT: DateFormat = "dotted";

function assemble(format: DateFormat, day: string, month: string, year: string, hour: string, minute: string): string {
  const time = `${hour}:${minute}`;
  switch (format) {
    case "iso":
      return `${year}-${month}-${day} ${time}`;
    case "mdy":
      return `${month}/${day}/${year} ${time}`;
    case "dmy":
      return `${day}/${month}/${year} ${time}`;
    default:
      return `${day}.${month}.${year} ${time}`;
  }
}

/** `undefined` means the shell wrote no timestamp, which is shown as a dash. */
export function formatTimestamp(when: number | undefined, format: DateFormat): string {
  if (when === undefined) return "—";

  const moment = new Date(when);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = pad(moment.getDate());
  const month = pad(moment.getMonth() + 1);
  const year = String(moment.getFullYear());
  const hour = pad(moment.getHours());
  const minute = pad(moment.getMinutes());

  return assemble(format, day, month, year, hour, minute);
}
