import { shellQuote as quote } from "./shell.ts";

export interface AlertOptions {
  /** The timer's note, shown by the notification. Arbitrary user text. */
  note: string;
  /** Absolute path to the bundled alarm. */
  sound: string;
  /** Touched by "Stop Timer Sound"; the repeating alarm watches it. */
  stopFlag: string;
  /** Written by the extension when music starts; removed here. */
  musicPidFile: string;
  repeat: boolean;
}

/**
 * The bash the transient systemd unit runs when the timer is due: stop the
 * music, notify, then play the alarm once or until the stop flag appears.
 *
 * Built as one string because that is what `systemd-run … bash -c` takes; every
 * path and the note go through `shellQuote`, since the note is typed by hand.
 */
export function alertScript({ note, sound, stopFlag, musicPidFile, repeat }: AlertOptions): string {
  const player = `paplay ${quote(sound)} >/dev/null 2>&1 || pw-play ${quote(sound)} >/dev/null 2>&1 || aplay ${quote(sound)} >/dev/null 2>&1`;
  const silence = `pid=$(cat ${quote(musicPidFile)} 2>/dev/null); [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -f ${quote(musicPidFile)}`;
  const alarm = repeat
    ? `rm -f ${quote(stopFlag)}; while [ ! -f ${quote(stopFlag)} ]; do ${player}; sleep 1; done`
    : player;
  return `${silence}; notify-send -a Vicinae ${quote("Timer")} ${quote(note)}; ${alarm}`;
}

export function systemdCommand(seconds: number, unitName: string, script: string): string {
  const delay = Math.max(1, Math.round(seconds));
  return `systemd-run --user --on-active=${delay}s --timer-property=AccuracySec=1s --unit=${unitName} -- /usr/bin/env bash -c ${quote(script)}`;
}
