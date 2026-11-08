import { Action, ActionPanel, Form, Toast, closeMainWindow, showToast } from "@vicinae/api";
import { hostname } from "node:os";
import { useState } from "react";

import { startHotspot } from "../utils/hotspot";

export default function CreateHotspotNmcli() {
  const [busy, setBusy] = useState(false);
  const defaultSsid = hostname().slice(0, 32);

  async function submit(values: Form.Values) {
    const band = String(values.band ?? "bg");
    setBusy(true);
    const toast = await showToast({
      title: "Starting the hotspot",
      message: values.ssid ? `Sharing the connection as ${values.ssid}` : undefined,
    });
    try {
      const message = await startHotspot({
        ssid: String(values.ssid ?? ""),
        password: String(values.password ?? ""),
        ...(band === "a" || band === "bg" ? { band } : {}),
      });
      toast.style = Toast.Style.Success;
      toast.title = message;
      toast.message = "Stop it from Manage Saved Networks, or by disconnecting the hotspot.";
      await closeMainWindow();
      return true;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "The hotspot did not start";
      toast.message = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle="Create Hotspot"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Hotspot" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Share the current connection"
        text="Creates a Wi-Fi hotspot with nmcli. The device needs a Wi-Fi adapter and NetworkManager."
      />
      <Form.TextField
        id="ssid"
        title="Network name"
        placeholder="hotspot"
        defaultValue={defaultSsid}
      />
      <Form.PasswordField
        id="password"
        title="Password"
        placeholder="At least 8 characters"
      />
      <Form.Dropdown id="band" title="Band" defaultValue="bg">
        <Form.Dropdown.Item value="bg" title="2.4 GHz" />
        <Form.Dropdown.Item value="a" title="5 GHz" />
      </Form.Dropdown>
    </Form>
  );
}
