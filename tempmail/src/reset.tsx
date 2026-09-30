import { Action, ActionPanel, Detail, Icon, popToRoot, showHUD } from "@vicinae/api";

import * as mail from "~/api/mail";
import { attempt } from "~/hooks/use-mailbox";

/**
 * Throws the current address away. `unregister` removes every key this extension
 * writes — address, password, token, account id, last seen and expiry — so there
 * is no list here to keep in step with them.
 */
export default function Reset() {
  return (
    <Detail
      markdown={`# TempMail has been reset

The address is deleted on mail.tm and everything in it goes with it. The next time
the inbox opens it will make a new one.

Mail already downloaded — saved \`.eml\` files and attachments — is left where it
is. Delete those from the file manager if you want them gone too.`}
      actions={
        <ActionPanel>
          <Action
            title="Reset TempMail"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={() =>
              void attempt(async () => {
                await mail.unregister();
                await mail.setExpiryMinutes(0);
                await popToRoot();
                await showHUD("TempMail was reset");
              })
            }
          />
        </ActionPanel>
      }
    />
  );
}
