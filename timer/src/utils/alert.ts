import { shellQuote as quote } from "./shell.ts";

export interface AlertOptions {
  /** The timer's note, shown by the notification. Arbitrary user text. */
  note: string;
  /** Absolute path to the bundled alarm. */
  sound: string;
  /** Holds the epoch millis of "Stop Timer Sound"; see `stopSound`. */
  stopFlag: string;
  /** Written by the extension when music starts; removed here. */
  musicPidFile: string;
  /** When the timer was made, in epoch millis: a stop before that is for another timer. */
  startedAt: number;
  repeat: boolean;
}

/**
 * The bash the transient systemd unit runs when the timer is due: stop the
 * music, and unless the alarm was stopped after this timer was made, notify
 * and play the alarm once or until the stop flag moves.
 *
 * Built as one string because that is what `systemd-run … bash -c` takes; every
 * path and the note go through `shellQuote`, since the note is typed by hand.
 */
export function alertScript({ note, sound, stopFlag, musicPidFile, startedAt, repeat }: AlertOptions): string {
  const player = `paplay ${quote(sound)} >/dev/null 2>&1 || pw-play ${quote(sound)} >/dev/null 2>&1 || aplay ${quote(sound)} >/dev/null 2>&1`;
  const silence = `pid=$(cat ${quote(musicPidFile)} 2>/dev/null); [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -f ${quote(musicPidFile)}`;
  // "Stop Timer Sound" writes the time it was pressed. Comparing that with this
  // timer's own start is what keeps a stop pressed before an older timer fired
  // from silencing a timer made afterwards, and lets a stop pressed before the
  // deadline count when it arrives.
  const stopped = `stopped() { [ -f ${quote(stopFlag)} ] && [ "$(cat ${quote(stopFlag)} 2>/dev/null || echo 0)" -ge ${startedAt} ]; }`;
  const alarm = repeat
    ? `while :; do stopped && break; ${player}; sleep 1; done`
    : player;
  return `${silence}; ${stopped}; if stopped; then exit 0; fi; notify-send -a Vicinae ${quote("Timer")} ${quote(note)}; ${alarm}`;
}

export function systemdCommand(seconds: number, unitName: string, script: string): string {
  const delay = Math.max(1, Math.round(seconds));
  return `systemd-run --user --on-active=${delay}s --timer-property=AccuracySec=1s --unit=${unitName} -- /usr/bin/env bash -c ${quote(script)}`;
}
