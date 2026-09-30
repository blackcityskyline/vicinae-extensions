import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useState } from "react";

import { clearTdp, setTdp } from "~/api/vectis";
import StatusDetail from "~/components/StatusDetail";
import { reportResult } from "~/components/feedback";
import { MAX_U32 } from "~/utils/vectis";

type Problems = { pl1?: string; pl2?: string; tau?: string; form?: string };

/**
 * A hard RAPL cap.
 *
 * PL1 is the sustained limit and PL2 the short boost limit. "Hard lock" forces
 * PL2 down to PL1, which removes the boost window entirely — that happens in
 * `TdpLimit::resolve` on the daemon side, so the checkbox is what carries it.
 */
export default function TdpForm({ onSaved }: { onSaved?: () => void }) {
  const [pl1, setPl1] = useState("");
  const [pl2, setPl2] = useState("");
  const [tau, setTau] = useState("");
  const [hardLock, setHardLock] = useState(false);
  const [problems, setProblems] = useState<Problems>({});
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Blank means "leave it alone", which is an absent argument rather than a
   * zero: `vectis tdp` reads 0 as unset, but a literal 0 W would read as a
   * deliberate cap to anyone reading the sysfs file afterwards.
   */
  function parseLimit(value: string): { value?: number; error?: string } {
    const trimmed = value.trim();
    if (trimmed.length === 0) return {};

    // The daemon's D-Bus method takes u32, so a decimal or a negative would be
    // refused downstream with a message that does not name the field.
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) return { error: "Whole watts, not a decimal." };
    if (parsed > MAX_U32) return { error: "Too large; the daemon takes a 32-bit value." };
    return { value: parsed };
  }

  async function submit() {
    const pl1Result = parseLimit(pl1);
    const pl2Result = parseLimit(pl2);
    const tauResult = parseLimit(tau);

    const found: Problems = {};
    if (pl1Result.error) found.pl1 = pl1Result.error;
    if (pl2Result.error) found.pl2 = pl2Result.error;
    if (tauResult.error) found.tau = tauResult.error;

    const nothingToSet =
      pl1Result.value === undefined && pl2Result.value === undefined && tauResult.value === undefined;
    if (nothingToSet && !hardLock) {
      found.form = "Fill in at least one limit, or use Reset to go back to the hardware defaults.";
    }

    if (Object.keys(found).length > 0) {
      setProblems(found);
      return;
    }
    setProblems({});

    setIsLoading(true);
    try {
      const result = await setTdp({
        pl1: pl1Result.value,
        pl2: pl2Result.value,
        tau: tauResult.value,
        hardLock,
      });
      if (await reportResult(result, "Power limit updated")) onSaved?.();
    } finally {
      setIsLoading(false);
    }
  }

  async function reset() {
    setIsLoading(true);
    try {
      const result = await clearTdp();
      if (await reportResult(result, "Power limit reset", "Back to the hardware defaults.")) {
        onSaved?.();
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Set Power Limit" icon={Icon.Check} onSubmit={submit} />
          <Action title="Reset to Hardware Defaults" icon={Icon.ArrowCounterClockwise} onAction={reset} />
          <Action.Push title="Show Current Status" icon={Icon.Info01} target={<StatusDetail />} />
        </ActionPanel>
      }
    >
      {problems.form ? <Form.Description text={problems.form} /> : null}

      <Form.TextField
        id="pl1"
        title="Sustained Power (PL1)"
        placeholder="25"
        info="Watts. Leave empty to leave it alone."
        value={pl1}
        onChange={setPl1}
        error={problems.pl1}
      />
      <Form.TextField
        id="pl2"
        title="Boost Power (PL2)"
        placeholder="32"
        info="Watts for the short boost window."
        value={pl2}
        onChange={setPl2}
        error={problems.pl2}
      />
      <Form.TextField
        id="tau"
        title="Boost Window (tau)"
        placeholder="976"
        info="Microseconds the PL2 limit applies for."
        value={tau}
        onChange={setTau}
        error={problems.tau}
      />
      <Form.Checkbox
        id="hardLock"
        label="Hard lock — force PL2 down to PL1"
        value={hardLock}
        onChange={setHardLock}
      />

      <Form.Description
        title="Hard TDP cap"
        text="Writes straight to /sys/class/powercap, independently of the power profile, so a cap set here survives switching between Powersave, Balanced and Performance."
      />
    </Form>
  );
}