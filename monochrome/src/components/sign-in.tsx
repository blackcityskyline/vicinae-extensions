/**
 * Sign in and sign up talk to the same account server the web app uses. The token that comes
 * back is kept in Vicinae's LocalStorage, which is encrypted on disk and is the place this
 * repository asks for a persistent secret.
 */

import { Action, ActionPanel, Form, Icon, Toast, showToast, useNavigation } from "@vicinae/api";
import { useState } from "react";

import { signIn, signUp, type Session } from "~/api/auth";

type Mode = "in" | "up";

export function SignInView({
  mode,
  onSignedIn,
}: {
  mode: Mode;
  /** Stores the session; the account row picks it up from here. */
  onSignedIn: (session: Session) => Promise<void>;
}) {
  const { pop } = useNavigation();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const trimmed = address.trim();
    if (trimmed === "" || password === "") {
      await showToast(Toast.Style.Failure, "Email and password are required");
      return;
    }

    setBusy(true);
    try {
      const session =
        mode === "in"
          ? await signIn(trimmed, password)
          : await signUp(trimmed, password, name.trim() || trimmed.split("@")[0] || trimmed);

      await onSignedIn(session);
      await showToast(Toast.Style.Success, mode === "in" ? "Signed in" : "Account created");
      pop();
    } catch (error) {
      await showToast(
        Toast.Style.Failure,
        mode === "in" ? "Could not sign in" : "Could not sign up",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form
      navigationTitle={mode === "in" ? "Sign In to Monochrome" : "Create a Monochrome Account"}
      isLoading={busy}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={mode === "in" ? "Sign In" : "Sign Up"}
            icon={mode === "in" ? Icon.Lock : Icon.Person}
            shortcut="save"
            onSubmit={() => void submit()}
          />
        </ActionPanel>
      }
    >
      {mode === "up" ? (
        <Form.TextField
          id="name"
          title="Name"
          placeholder="The name other Monochrome users see"
          value={name}
          onChange={setName}
        />
      ) : null}
      <Form.TextField
        id="email"
        title="Email"
        placeholder="you@example.com"
        value={address}
        onChange={setAddress}
      />
      <Form.PasswordField id="password" title="Password" value={password} onChange={setPassword} />
    </Form>
  );
}
