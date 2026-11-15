/**
 * Parsers for the three edgepad reports the UI shows. They only understand the
 * line layout `edgepad status`, `edgepad doctor` and `edgepad devices` print;
 * the wording itself is passed through untouched.
 */

export type Severity = "ok" | "warn" | "fail";

export type StatusLine = { subject: string; detail: string };
export type StatusReport = { lines: StatusLine[]; result?: string };

export type DoctorCheck = { severity: Severity; name: string; detail: string };
export type DoctorSection = { title: string; checks: DoctorCheck[] };
export type DoctorSummary = { ok: number; warn: number; fail: number; result?: string };
export type DoctorReport = { sections: DoctorSection[]; summary?: DoctorSummary };

export type DeviceEntry = { path: string; kind?: string; name?: string; rest: string };

export function parseStatus(output: string): StatusReport {
  const lines: StatusLine[] = [];
  let result: string | undefined;
  for (const line of output.split("\n")) {
    const match = /^(\w+)\s{2,}(.+)$/.exec(line);
    if (!match) continue;
    const subject = match[1] ?? "";
    const detail = (match[2] ?? "").trim();
    if (subject === "Result") {
      result = detail;
      continue;
    }
    lines.push({ subject, detail });
  }
  return { lines, result };
}

export function parseDoctor(output: string): DoctorReport {
  const sections: DoctorSection[] = [];
  let current: DoctorSection | undefined;
  let summary: DoctorSummary | undefined;

  for (const line of output.split("\n")) {
    if (line.trim() === "" || line.startsWith("edgepad doctor")) continue;

    if (!line.startsWith(" ")) {
      const title = line.trim();
      if (title === "Summary") {
        current = undefined;
        continue;
      }
      current = { title, checks: [] };
      sections.push(current);
      continue;
    }

    const numbers = /ok=(\d+)\s+warn=(\d+)\s+fail=(\d+)/.exec(line);
    if (numbers) {
      summary = { ok: Number(numbers[1]), warn: Number(numbers[2]), fail: Number(numbers[3]) };
      continue;
    }
    const result = /result:\s*(.+)$/.exec(line);
    if (result && summary) {
      summary.result = result[1]?.trim();
      continue;
    }

    const check = /^\s+(ok|warn|fail)\s+(.+?)\s{2,}(.*)$/.exec(line);
    if (check && current) {
      current.checks.push({
        severity: check[1] as Severity,
        name: check[2] ?? "",
        detail: (check[3] ?? "").trim(),
      });
    }
  }

  return { sections, summary };
}

export function parseDevices(output: string): DeviceEntry[] {
  const devices: DeviceEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("/dev/")) continue;
    const match = /^(\S+)\s+kind=(\S+)\s+name="([^"]*)"(.*)$/.exec(trimmed);
    if (match) {
      devices.push({ path: match[1] ?? "", kind: match[2], name: match[3], rest: (match[4] ?? "").trim() });
    } else {
      devices.push({ path: trimmed.split(/\s+/)[0] ?? "", rest: trimmed });
    }
  }
  return devices;
}
