import { Action, Keyboard } from "@vicinae/api";
import { useSelectedVaultItem } from "~/components/searchVault/context/vaultItem";
import useReprompt from "~/utils/hooks/useReprompt";

/** Vicinae does not export `Action.Props`, so the shape is spelled out here. */
export type ActionWithRepromptProps = {
  title: string;
  icon?: React.ComponentProps<typeof Action>["icon"];
  shortcut?: Keyboard.Shortcut;
  autoFocus?: boolean;
  style?: React.ComponentProps<typeof Action>["style"];
  repromptDescription?: string;
  onAction: () => void | Promise<void>;
};

/**
 * An action that asks for the master password first when the selected item is
 * marked as requiring re-prompting.
 */
function ActionWithReprompt(props: ActionWithRepromptProps) {
  const { repromptDescription, onAction, ...componentProps } = props;
  const { reprompt } = useSelectedVaultItem();
  const repromptAndPerformAction = useReprompt(onAction, { description: repromptDescription });

  return <Action {...componentProps} onAction={reprompt ? repromptAndPerformAction : onAction} />;
}

export default ActionWithReprompt;
