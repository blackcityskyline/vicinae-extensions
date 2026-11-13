import {
  Action,
  ActionPanel,
  Form,
  Icon,
  Toast,
  open,
  showToast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useRef, useState } from "react";
import { randomBytes } from "node:crypto";

import { saveConfig, type Config, type Environment } from "../api/config";
import { listAccounts, type ListedAccount } from "../api/ctrader";
import {
  DEFAULT_REDIRECT,
  authorizationUrl,
  exchangeCode,
  waitForCode,
  type Callback,
  type Tokens,
} from "../api/oauth";

/**
 * The plugin's terminal wizard, as a form.
 *
 * The owner creates their own Open API application at openapi.ctrader.com — the extension can
 * neither ship nor mint one — so this asks for that application's client id and secret, sends the
 * browser to cTrader, and serves the redirect on 127.0.0.1:7331 while the form waits. The scope is
 * `accounts`: the token can read and nothing else.
 */

type Credentials = { clientId: string; clientSecret: string; environment: Environment; redirectUri: string };

type Step =
  | { kind: "credentials" }
  | { kind: "waiting" }
  | { kind: "accounts"; accounts: ListedAccount[]; tokens: Tokens; credentials: Credentials };

export function SetupForm({ path, onSaved }: { path: string; onSaved: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [saved, setSaved] = useState<Partial<Config>>({});
  const waiting = useRef<Callback | null>(null);
  const { pop } = useNavigation();

  useEffect(() => {
    return () => waiting.current?.close();
  }, []);

  async function finish(account: ListedAccount, tokens: Tokens, credentials: Credentials) {
    const config: Config = {
      environment: credentials.environment,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: credentials.redirectUri,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accountId: account.id,
      traderLogin: account.login,
    };
    saveConfig(path, config);
    setSaved(config);
    await showToast({ style: Toast.Style.Success, title: "Connected", message: `Account ${account.login}` });
    onSaved();
    pop();
  }

  async function connect(values: Form.Values) {
    const clientId = String(values.clientId ?? "").trim();
    const clientSecret = String(values.clientSecret ?? "").trim();
    const environment: Environment = values.environment === "live" ? "live" : "demo";
    if (!clientId || !clientSecret) {
      await showToast({ style: Toast.Style.Failure, title: "Both are required", message: "The client id and secret from your cTrader application." });
      return false;
    }

    const credentials: Credentials = { clientId, clientSecret, environment, redirectUri: DEFAULT_REDIRECT };
    const state = randomBytes(24).toString("base64url");
    setStep({ kind: "waiting" });

    const callback = waitForCode(DEFAULT_REDIRECT, state);
    waiting.current = callback;
    try {
      await open(authorizationUrl({ clientId, redirectUri: DEFAULT_REDIRECT, state }));
      const code = await callback.code;
      const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri: DEFAULT_REDIRECT });
      const accounts = await listAccounts({ environment, clientId, clientSecret }, tokens.accessToken);
      const matching = accounts.filter((account) => account.live === (environment === "live"));
      if (matching.length === 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: `No ${environment} account is linked`,
          message: accounts.length ? `The token sees ${accounts.length} account(s) in the other environment.` : "The authorisation granted no accounts.",
        });
        setStep({ kind: "credentials" });
        return false;
      }
      if (matching.length === 1) {
        await finish(matching[0]!, tokens, credentials);
        return;
      }
      setStep({ kind: "accounts", accounts: matching, tokens, credentials });
      return false;
    } catch (cause) {
      await showToast({ style: Toast.Style.Failure, title: "Could not connect", message: (cause as Error).message });
      setStep({ kind: "credentials" });
      return false;
    } finally {
      waiting.current = null;
    }
  }

  async function choose(values: Form.Values) {
    if (step.kind !== "accounts") return false;
    const chosen = step.accounts.find((account) => String(account.id) === String(values.account));
    if (!chosen) {
      await showToast({ style: Toast.Style.Failure, title: "Pick an account" });
      return false;
    }
    await finish(chosen, step.tokens, step.credentials);
    return false;
  }

  if (step.kind === "waiting") {
    return (
      <Form isLoading navigationTitle="Connect cTrader">
        <Form.Description text="Waiting for the browser. Approve access at cTrader, and this window fills in by itself." />
      </Form>
    );
  }

  if (step.kind === "accounts") {
    return (
      <Form
        navigationTitle="Pick an Account"
        actions={
          <ActionPanel>
            <Action.SubmitForm title="Use This Account" icon={Icon.CheckCircle} onSubmit={choose} />
            <Action title="Start Over" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["ctrl"], key: "r" }} onAction={() => setStep({ kind: "credentials" })} />
          </ActionPanel>
        }
      >
        <Form.Description text="This authorisation can read more than one account. The one picked here is the one this command shows." />
        <Form.Dropdown id="account" title="Account" defaultValue={String(step.accounts[0]!.id)}>
          {step.accounts.map((account) => (
            <Form.Dropdown.Item key={account.id} title={`${account.login || account.id} · ${account.live ? "live" : "demo"}`} value={String(account.id)} icon={Icon.Person} />
          ))}
        </Form.Dropdown>
      </Form>
    );
  }

  return (
    <Form
      navigationTitle="Connect cTrader"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Authorise in Browser" icon={Icon.Link} onSubmit={connect} />
        </ActionPanel>
      }
    >
      <Form.Description text="Create an application at openapi.ctrader.com (Applications → Add application) with the redirect URI http://localhost:7331/callback, then paste its client id and secret here. They are yours: they stay in this extension's support folder, readable only by you." />
      <Form.TextField id="clientId" title="Client ID" placeholder="From your cTrader application" defaultValue={saved.clientId} />
      <Form.PasswordField id="clientSecret" title="Client Secret" placeholder="From your cTrader application" defaultValue={saved.clientSecret} />
      <Form.Dropdown id="environment" title="Account Type" defaultValue={saved.environment ?? "demo"} info="Which cTrader environment the account lives in.">
        <Form.Dropdown.Item title="Demo" value="demo" icon={Icon.Circle} />
        <Form.Dropdown.Item title="Live" value="live" icon={Icon.Coins} />
      </Form.Dropdown>
      <Form.Description title="Read-only" text="The authorisation asks for the accounts scope, so it cannot place, amend or close an order." />
    </Form>
  );
}
