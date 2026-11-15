import { CONTROL_PORT, DEFAULT_PORT, PORT_RANGE } from "~/utils/types";

export type PortChoice = {
  port: number;
  /** Set when the configured port is unusable, so the panel can say why the default was used. */
  problem?: string;
};

export function resolvePort(raw: string | undefined): PortChoice {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { port: DEFAULT_PORT };

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < PORT_RANGE.min || parsed > PORT_RANGE.max) {
    return {
      port: DEFAULT_PORT,
      problem: `"${trimmed}" is not an integer between ${PORT_RANGE.min} and ${PORT_RANGE.max}. Using ${DEFAULT_PORT} instead.`,
    };
  }
  if (parsed === CONTROL_PORT) {
    return {
      port: DEFAULT_PORT,
      problem: `${CONTROL_PORT} is reserved for the local control channel. Using ${DEFAULT_PORT} instead.`,
    };
  }
  return { port: parsed };
}
