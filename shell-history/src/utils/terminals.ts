/**
 * How to ask each terminal emulator to run a program, kept apart from PATH
 * lookups and spawning so the argv can be checked directly.
 */

export const TERMINAL_NAMES = [
  "foot",
  "kitty",
  "alacritty",
  "wezterm",
  "ghostty",
  "gnome-terminal",
  "konsole",
  "xfce4-terminal",
  "xterm",
] as const;

/**
 * The freedesktop.org launcher. Not offered in the dropdown: it is what `auto`
 * prefers when it is installed, and it takes no exec flag of its own.
 */
export const XDG_TERMINAL = "xdg-terminal-exec";

/** Everything `invocation` accepts: the dropdown plus the xdg launcher. */
export const LAUNCHABLE: string[] = [...TERMINAL_NAMES, XDG_TERMINAL];

/** argv each terminal wants between itself and the program. */
const EXEC_FLAGS: Record<string, string[]> = {
  [XDG_TERMINAL]: [],
  foot: [],
  kitty: [],
  alacritty: ["-e"],
  wezterm: ["start", "--"],
  ghostty: ["-e"],
  "gnome-terminal": ["--"],
  konsole: ["-e"],
  "xterm": ["-e"],
  "xfce4-terminal": ["-e"],
};

/** The one terminal whose exec flag takes a single string rather than an argv. */
const SINGLE_STRING = "xfce4-terminal";

export const COMMAND_VAR = "VICINAE_HISTORY_COMMAND";
export const SHELL_VAR = "VICINAE_HISTORY_SHELL";

/**
 * A fixed script, identical for every shell, that runs the command and then
 * hands over to an interactive shell so the output stays on screen.
 *
 * The command arrives in the environment rather than in argv for two reasons:
 * argv is world-readable through `/proc`, and a history entry may hold a token.
 * It also has to be in the environment because `"$1"` in a `-c` script is not
 * re-parsed — bash tries to run `a; b` as a program whose name is `a; b`.
 */
export const RUN_SCRIPT = `eval "$${COMMAND_VAR}"; exec "$${SHELL_VAR}" -i`;

export type Invocation = { ok: true; argv: string[]; env: Record<string, string> } | { ok: false; message: string };

export function invocation(terminal: string, binary: string, shell: string, command: string): Invocation {
  const flags = EXEC_FLAGS[terminal];
  if (!flags) return { ok: false, message: `"${terminal}" is not a terminal this extension knows how to launch.` };
  if (!command.trim()) return { ok: false, message: "There is no command to run." };

  // RUN_SCRIPT contains no single quote, so quoting the whole thing is enough.
  const args =
    terminal === SINGLE_STRING ? [`'${shell} -c ${RUN_SCRIPT}'`] : [shell, "-c", RUN_SCRIPT];

  return {
    ok: true,
    argv: [binary, ...flags, ...args],
    env: { [COMMAND_VAR]: command, [SHELL_VAR]: shell },
  };
}
