import { Action, ActionPanel, Form, Icon, getPreferenceValues } from "@vicinae/api";
import { useEffect, useState } from "react";

import * as mail from "~/api/mail";
import { validUsername } from "~/utils/when";

export type NewAddressValues = {
  username: string;
  domain: string;
  lifetime: string;
};

/**
 * A name you choose, for the signups where you have to type the address twice
 * and a random one would be no use.
 */
export default function NewAddress({ onDone }: { onDone: () => Promise<void> }) {
  const { defaultDuration } = getPreferenceValues<Preferences>();
  const [domains, setDomains] = useState<string[]>([]);
  const [isLoadingDomains, setIsLoadingDomains] = useState(true);
  const [usernameError, setUsernameError] = useState<string | undefined>();

  useEffect(() => {
    void mail
      .domains()
      .then(setDomains)
      .catch(() => setDomains([]))
      .finally(() => setIsLoadingDomains(false));
  }, []);

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Address"
            icon={Icon.PlusCircle}
            onSubmit={async (values) => {
              const { username, domain, lifetime } = values as NewAddressValues;

              const problem = validUsername(username);
              if (problem) {
                setUsernameError(problem);
                return;
              }

              try {
                // Any address already in place is deleted by `register`, so this
                // replaces it the way upstream's `new` does.
                await mail.register(username, domain, Number(lifetime));
              } catch (failure) {
                setUsernameError(failure instanceof Error ? failure.message : "Could not create that address.");
                return;
              }

              await onDone();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="username"
        title="Username"
        placeholder="no-spaces"
        info="Anything you can type twice without mistaking it"
        error={usernameError}
        onChange={() => setUsernameError(undefined)}
      />
      <Form.Dropdown
        id="domain"
        title="Domain"
        isLoading={isLoadingDomains}
        info={domains.length === 0 ? "mail.tm did not offer any domain" : `mail.tm currently offers ${domains.length}`}
      >
        {domains.map((domain) => (
          <Form.Dropdown.Item key={domain} title={domain} value={domain} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="lifetime" title="Alive For" defaultValue={defaultDuration}>
        {[10, 30].map((minutes) => (
          <Form.Dropdown.Item key={minutes} title={`${minutes} minutes`} value={String(minutes)} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
