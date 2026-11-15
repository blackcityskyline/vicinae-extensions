import type { ServiceType } from "../types";

export type ServiceAction = "start" | "stop" | "restart" | "reload" | "enable" | "disable";

/** How actions on system units reach root: systemctl's own polkit call, or pkexec. */
export type Escalation = "polkit" | "pkexec";

/**
 * The argv for one systemctl action. Arguments stay an array all the way to
 * execFile, so a unit name can never be read as shell syntax.
 *
 * `pkexec systemctl --user` cannot work: pkexec drops the session bus, so user
 * units always go through the plain command.
 */
export function serviceCommand(
  action: ServiceAction,
  unit: string,
  type: ServiceType,
  escalation: Escalation,
): string[] {
  const systemctl = type === "user" ? ["systemctl", "--user", action, unit] : ["systemctl", action, unit];
  return escalation === "pkexec" && type === "system" ? ["pkexec", ...systemctl] : systemctl;
}

/** Turn the tool's own failure into something the user can act on. */
export function explainFailure(raw: string): string {
  const text = raw.trim();
  if (
    /No authentication agent found|Interactive authentication required|Error executing command as another user|Not authorized|Access denied/i.test(
      text,
    )
  ) {
    return `${text}\n\nPolkit had no agent to ask for a password. Start one in this session (polkit-gnome-authentication-agent-1 or hyprpolkitagent), then retry.`;
  }
  if (/spawn .* ENOENT|command not found/i.test(text)) {
    return `${text}\n\nThe command is not installed; pkexec comes with polkit.`;
  }
  if (/Unit .* (not found|could not be found)|No such file or directory/i.test(text)) {
    return `${text}\n\nThe unit is not loaded by this systemd manager.`;
  }
  return text || "The command failed without printing a reason.";
}
