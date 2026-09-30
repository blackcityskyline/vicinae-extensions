import { Action, ActionPanel, Clipboard, LocalStorage } from "@vicinae/api";
import { Icon } from "~/utils/icons";
import { LOCAL_STORAGE_KEY } from "~/constants/general";
import { showCopySuccessMessage } from "~/utils/clipboard";
import { getTransientCopyPreference } from "~/utils/preferences";

export type GeneratePasswordActionPanelProps = {
  password: string | undefined;
  regeneratePassword: () => void;
};

const GeneratePasswordActionPanel = (props: GeneratePasswordActionPanelProps) => {
  const { password, regeneratePassword } = props;

  const handleCopy = (password: string) => async () => {
    await Clipboard.copy(password, { concealed: getTransientCopyPreference("password") });
    await showCopySuccessMessage("Copied password to clipboard");
  };

  return (
    <ActionPanel>
      {!!password && (
        <>
          <Action
            title="Copy Password"
            icon={Icon.Clipboard}
            onAction={handleCopy(password)}
            shortcut={{ key: "enter", modifiers: ["alt"] }}
          />
          <Action.Paste
            title="Paste Password to Active App"
            icon={Icon.Text}
            content={password}
            shortcut={{ key: "enter", modifiers: ["alt", "shift"] }}
          />
        </>
      )}
      <Action
        title="Regenerate Password"
        icon={Icon.ArrowClockwise}
        shortcut={{ key: "backspace", modifiers: ["alt"] }}
        /* avoid passing a reference to onAction because, for some reason, a string
        is passed to it, even though the type says otherwise 🤔 */
        onAction={() => regeneratePassword()}
      />
      {process.env.NODE_ENV === "development" && (
        <Action title="Clear storage" icon={Icon.Trash} onAction={clearStorage} />
      )}
    </ActionPanel>
  );
};

async function clearStorage() {
  for (const key of Object.values(LOCAL_STORAGE_KEY)) {
    await LocalStorage.removeItem(key);
  }
}

export default GeneratePasswordActionPanel;
