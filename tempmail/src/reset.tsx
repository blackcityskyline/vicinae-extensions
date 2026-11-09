import { Action, ActionPanel, Detail, Icon, popToRoot, showHUD } from "@vicinae/api";

import * as mail from "~/api/mail";
import { attempt } from "~/hooks/use-mailbox";

/**
 * Throws the current address away. `unregister` removes every key this extension
 * writes — address, password, token, account id, lifetime, the ids already
 * announced, and the saved HTML pages — so there is no list here to keep in step
 * with them, and the background check stops having anything to check.
 */
export default function Reset() {
  return (
    <Detail
      markdown={`# TempMail has been reset

The address is deleted on mail.tm and everything in it goes with it, including
the sandboxed HTML pages saved from its messages. The next time the inbox opens
it offers to make a new one.

Until then the background **Check For Mail** command has no address to poll, so
it makes no requests and sends no notifications.`}
      actions={
        <ActionPanel>
          <Action
            title="Reset TempMail" shortcut={{ modifiers: ["ctrl"], key: "a" }}
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            onAction={() =>
              void attempt(async () => {
                await mail.unregister();
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
