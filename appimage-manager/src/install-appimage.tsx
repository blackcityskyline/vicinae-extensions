import { InstallForm } from "./components/InstallForm";

/**
 * The install form as its own command, for a keybinding or a deeplink.
 *
 * The manager pushes the same component, so both paths share one implementation.
 */
export default function InstallAppImageCommand() {
  return <InstallForm onDone={() => undefined} />;
}
