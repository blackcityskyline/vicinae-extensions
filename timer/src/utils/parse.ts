/** A timer typed into the search bar: "25m Pomodoro", "1:30", "2h". */
export interface Parsed {
  seconds: number;
  note: string;
}

export function parseDuration(input: string): Parsed | null {
  const text = input.trim();
  if (!text) return null;
  // Upstream's grammar: a clock value ("1:30" or "1:02:03") or a number with
  // an optional unit, then an optional free-form note.
  const match = text.match(/^((?:\d+:\d{1,2}(?::\d{1,2})?)|\d+[hms]?)(?:\s+(.*))?$/i);
  if (!match) return null;

  const value = (match[1] ?? "").toLowerCase();
  const note = (match[2] ?? "").trim() || "Timer";

  let seconds: number | null = null;
  const clock = value.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const first = Number.parseInt(clock[1] ?? "0", 10);
    const second = Number.parseInt(clock[2] ?? "0", 10);
    const third = clock[3] ? Number.parseInt(clock[3], 10) : null;
    seconds = third === null ? first * 60 + second : first * 3600 + second * 60 + third;
  } else {
    const simple = value.match(/^(\d+)([hms])?$/);
    if (simple) {
      const amount = Number.parseInt(simple[1] ?? "0", 10);
      const unit = simple[2] ?? "m";
      seconds = unit === "h" ? amount * 3600 : unit === "m" ? amount * 60 : amount;
    }
  }

  if (seconds === null || seconds <= 0) return null;
  return { seconds, note };
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  const padded = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${padded(minutes)}:${padded(rest)}` : `${minutes}:${padded(rest)}`;
}

export function endsAtText(epoch: number): string {
  return new Date(epoch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
