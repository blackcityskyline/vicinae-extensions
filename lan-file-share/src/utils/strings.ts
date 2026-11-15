/** All user-facing copy, in one place so the panel reads as a layout and not as prose. */
export const strings = {
  fileShare: "LAN File Share",
  refresh: "Refresh",
  openPreferences: "Open Extension Preferences",

  statusRunning: "Sharing Is On",
  statusStopped: "Sharing Is Off",
  statusUnknown: "Session State Unknown",
  statusConflict: "Port Already Taken",
  statusNoInterface: "No Network Interface",
  startHint: "Start sharing to get a link and a QR code.",

  start: "Start Sharing",
  stop: "Stop Sharing",
  restart: "Restart Service",
  copyAddress: "Copy Address",
  openInBrowser: "Open in Browser",
  restartNeededDetail:
    "The port or interface changed. The service keeps its old address until it is restarted.",

  interfaceDropdown: "Network Interface",
  shareLink: "Share Link",
  qrCode: "QR Code",
  switchInterfaceTitle: (name: string, address: string) => `Share on ${name} (${address})?`,
  switchInterfaceMessage:
    "The service has to restart to listen on the new interface. Visitors using the current address will be disconnected.",
  interfaceWillApplyOnStart: (address: string) => `Interface saved: ${address}`,
  later: "Later",
  noInterfaceDetail:
    "No interface with an IPv4 address is available right now. Connect to Wi-Fi or Ethernet and refresh.",

  addItems: "Add Files Or Folders…",
  addItemsTitle: "Add To Share List",
  addItemsPath: "Files Or Folders",
  addItemsHint: "Everything picked here stays where it is — the list only references the path.",
  addItemsSubmit: "Add To Share List",
  referencedInPlace: "Referenced in place — nothing was copied.",
  added: (count: number) => `Added ${count} ${count === 1 ? "item" : "items"}`,
  addFailed: "Could not add to the share list",

  openReceiveDirectory: "Open Receive Directory",

  unreachableAfterStart: "The service started but its page does not answer",
  /** The post-start check runs on this machine, so it cannot see a firewall that only blocks other devices. */
  firewallHint: (port: number) =>
    `If other devices cannot open the link, allow incoming connections to port ${port} in your firewall.`,
};
