export type Distro = "auto" | "ubuntu" | "fedora" | "arch";

export function escapeGrubString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildGrubEntry({
  isoPath,
  title,
  distro,
}: {
  isoPath: string;
  title: string;
  distro: Distro;
}): string {
  const p = escapeGrubString(isoPath);
  const t = escapeGrubString(title);

  if (distro === "ubuntu") {
    return `menuentry "${t}" {
  set iso_path="${p}"
  search --set=root --file $iso_path
  loopback loop $iso_path
  linux (loop)/casper/vmlinuz boot=casper iso-scan/filename=$iso_path quiet splash
  initrd (loop)/casper/initrd
}`;
  }

  if (distro === "fedora") {
    return `menuentry "${t}" {
  set iso_path="${p}"
  search --set=root --file $iso_path
  loopback loop $iso_path
  linux (loop)/isolinux/vmlinuz inst.stage2=hd:LABEL=Fedora-Ws-Live iso-scan/filename=$iso_path
  initrd (loop)/isolinux/initrd.img
}`;
  }

  if (distro === "arch") {
    return `menuentry "${t}" {
  set iso_path="${p}"
  search --set=root --file $iso_path
  loopback loop $iso_path
  if [ -f (loop)/boot/grub/loopback.cfg ]; then
    configfile (loop)/boot/grub/loopback.cfg
  else
    echo "No loopback config found in ISO"
  fi
}`;
  }

  return `menuentry "${t}" {
  set iso_path="${p}"
  search --set=root --file $iso_path
  loopback loop $iso_path
  if [ -f (loop)/boot/grub/loopback.cfg ]; then
    configfile (loop)/boot/grub/loopback.cfg
  elif [ -f (loop)/boot/grub/grub.cfg ]; then
    configfile (loop)/boot/grub/grub.cfg
  elif [ -f (loop)/grub/grub.cfg ]; then
    configfile (loop)/grub/grub.cfg
  elif [ -f (loop)/EFI/boot/grub.cfg ]; then
    configfile (loop)/EFI/boot/grub.cfg
  else
    echo "No GRUB config found in ISO"
  fi
}`;
}

export function buildInstallScript({
  entry,
  reboot,
}: {
  entry: string;
  reboot: boolean;
}): string {
  const lines = [
    "set -e",
    'ENTRY_FILE=$(mktemp)',
    "cat > \"$ENTRY_FILE\" <<'GRUB_LOOPBACK_ENTRY'",
    entry,
    "GRUB_LOOPBACK_ENTRY",
    'sudo sed -i "/# BEGIN grub-loopback/,/# END grub-loopback/d" /boot/grub/custom.cfg || true',
    'CUSTOM=/etc/grub.d/40_custom',
    'sudo touch "$CUSTOM"',
    "sudo python3 - \"$CUSTOM\" <<'PY'",
    "import sys",
    "path = sys.argv[1]",
    "try:",
    "    s = open(path).read()",
    "except FileNotFoundError:",
    "    s = ''",
    "start = s.find('# BEGIN grub-loopback')",
    "end = s.find('# END grub-loopback')",
    "if start != -1 and end != -1:",
    "    s = s[:start] + s[end + len('# END grub-loopback') + 1:]",
    "open(path, 'w').write(s)",
    "PY",
    'printf \'\\n# BEGIN grub-loopback\\n\' | sudo tee -a "$CUSTOM" >/dev/null',
    'sudo tee -a "$CUSTOM" >/dev/null < "$ENTRY_FILE"',
    'printf \'# END grub-loopback\\n\' | sudo tee -a "$CUSTOM" >/dev/null',
    'sudo chmod +x "$CUSTOM"',
    'rm -f "$ENTRY_FILE"',
    'if command -v update-grub >/dev/null 2>&1; then sudo update-grub; elif command -v grub-mkconfig >/dev/null 2>&1; then sudo grub-mkconfig -o /boot/grub/grub.cfg; else echo "grub updater not found"; fi',
  ];

  if (reboot) {
    lines.push("sudo systemctl reboot");
  } else {
    lines.push('echo "Done. Reboot manually to use the new entry."');
  }

  return lines.join("\n");
}
