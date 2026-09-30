import setProfileCommand from "~/components/set-profile-command";

/** A no-view command: it runs on the keystroke that opened it and toasts. */
export default function SetPowersave() {
  return setProfileCommand("powersave");
}
