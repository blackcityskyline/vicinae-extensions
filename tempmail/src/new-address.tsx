import { Action, ActionPanel, Form, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";

import * as mail from "~/api/mail";
import { validUsername } from "~/utils/when";

const EXPIRY_CHOICES = [
  { minutes: 0, title: "Never" },
  { minutes: 5, title: "After 5 minutes" },
  { minutes: 30, title: "After 30 minutes" },
  { minutes: 60, title: "After an hour" },
  { minutes: 720, title: "After 12 hours" },
  { minutes: 1440, title: "After a day" },
  { minutes: 10080, title: "After a week" },
];

export type NewAddressValues = {
  username: string;
  domain: string;
  expiry: string;
};

/**
 * A name you choose, for the signups where you have to type the address twice
 * and a random one would be no use.
 */
export default function NewAddress({ onDone }: { onDone: () => Promise<void> }) {
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
              const { username, domain, expiry } = values as NewAddressValues;

              const problem = validUsername(username);
              if (problem) {
                setUsernameError(problem);
                return;
              }

              try {
                await mail.register(username, domain);
              } catch (failure) {
                setUsernameError(failure instanceof Error ? failure.message : "Could not create that address.");
                return;
              }

              await mail.setExpiryMinutes(Number(expiry));
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
      <Form.Dropdown id="expiry" title="Throw Away After" defaultValue="Never">
        {EXPIRY_CHOICES.map((choice) => (
          <Form.Dropdown.Item key={choice.minutes} title={choice.title} value={String(choice.minutes)} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
