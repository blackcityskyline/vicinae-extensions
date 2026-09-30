import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Toast,
  environment,
  getPreferenceValues,
  showToast,
} from "@vicinae/api";
import { InstalledCLINotFoundError, getErrorString } from "~/utils/errors";
import { Icon } from "~/utils/icons";

const LINE_BREAK = "\n\n";
const CLI_INSTALLATION_HELP_URL = "https://bitwarden.com/help/cli/#download-and-install";
const EXTENSION_SETTINGS_HINT =
  "Open the extension's settings to check the Client ID, Client Secret and CLI path.";

const getCodeBlock = (content: string) => `\`\`\`\n${content}\n\`\`\``;

type Messages = string | number | false | 0 | "" | null | undefined;

export type TroubleshootingGuideProps = {
  error?: unknown;
};

/** Full-screen error state shown when a command cannot start or crashes. */
const TroubleshootingGuide = ({ error }: TroubleshootingGuideProps) => {
  const errorString = getErrorString(error);
  const { cliPath } = getPreferenceValues<Preferences>();
  const cliMissing = error instanceof InstalledCLINotFoundError;

  const messages: Messages[] = [];

  if (cliMissing) {
    messages.push("# Bitwarden CLI not found");
  } else {
    messages.push("# Something went wrong");
  }

  if (cliMissing) {
    messages.push(
      `The extension runs the \`bw\` command-line tool, which is not installed or not on your PATH.${
        cliPath ? ` Configured path: \`${cliPath}\`.` : ""
      }`,
      "On Arch: `sudo pacman -S bitwarden-cli`. On Debian/Ubuntu: `sudo apt install bitwarden-cli`.",
      `See the [Bitwarden CLI installation guide](${CLI_INSTALLATION_HELP_URL}).`,
    );
  } else {
    messages.push(`The \`${environment.commandName}\` command failed unexpectedly.`);
  }

  messages.push(`> ${EXTENSION_SETTINGS_HINT}`);
  messages.push("**Try running the command again. If it keeps failing, the details below will help pinpoint the cause.**");

  if (errorString) {
    messages.push(">## Technical details", getCodeBlock(errorString));
  }

  return (
    <Detail
      markdown={messages.filter(Boolean).join(LINE_BREAK)}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open CLI Installation Guide" url={CLI_INSTALLATION_HELP_URL} />
          <Action title="Copy Error Details" icon={Icon.CopyClipboard} onAction={copyToClipboard(errorString)} />
        </ActionPanel>
      }
    />
  );
};

function copyToClipboard(text: string | undefined) {
  return async () => {
    if (!text) return;
    await Clipboard.copy(text);
    await showToast(Toast.Style.Success, "Error details copied");
  };
}

export default TroubleshootingGuide;
