import { RESOLVE_ISO } from "~/lib/resolve";

export type Distro = "auto" | "ubuntu" | "fedora";

/** The menu title is written inside a GRUB double-quoted string. */
export function sanitizeTitle(title: string): string {
  return title.replace(/[\r\n"\\$`]/g, "").trim();
}

/**
 * The body of an unquoted bash heredoc: `$TITLE`, `$FSMOD`, `$UUID`, `$FSPATH`
 * and `$LABEL` are filled in by bash once the ISO is resolved, and `\$` is a
 * GRUB variable that must reach grub.cfg untouched.
 *
 * Every entry follows the loopback.cfg convention: `iso_path` is exported, the
 * filesystem holding the ISO is found by UUID, and the ISO's own config is run
 * with the loop device as root.
 */
export function buildGrubEntry(distro: Distro): string {
  const head = `menuentry "$TITLE" {
  insmod part_gpt
  insmod part_msdos
  insmod $FSMOD
  insmod loopback
  insmod iso9660
  set iso_path="$FSPATH"
  export iso_path
  search --no-floppy --fs-uuid --set=root $UUID
  loopback loop "\\$iso_path"`;

  if (distro === "ubuntu") {
    return `${head}
  linux (loop)/casper/vmlinuz boot=casper iso-scan/filename="\\$iso_path" quiet splash ---
  initrd (loop)/casper/initrd
}`;
  }

  if (distro === "fedora") {
    return `${head}
  linux (loop)/images/pxeboot/vmlinuz root=live:CDLABEL=$LABEL iso-scan/filename="\\$iso_path" rd.live.image quiet
  initrd (loop)/images/pxeboot/initrd.img
}`;
  }

  return `${head}
  set root=(loop)
  if [ -f /boot/grub/loopback.cfg ]; then
    configfile /boot/grub/loopback.cfg
  else
    echo "No /boot/grub/loopback.cfg in this ISO. Try the Ubuntu or Fedora template."
    sleep 10
  fi
}`;
}

const BEGIN = "# BEGIN grub-loopback";
const END = "# END grub-loopback";

/**
 * Run as `bash -c <script> grub-loopback <iso> <title>`.
 *
 * Needs root for `blkid` and `btrfs subvolume get-default`, so the whole script
 * uses sudo and runs in a terminal.
 */
export function buildInstallScript({
  distro,
  reboot,
}: {
  distro: Distro;
  reboot: boolean;
}): string {
  const fedora =
    distro === "fedora"
      ? `
LABEL=$(blkid -s LABEL -o value "$ISO")
if [ -z "$LABEL" ]; then echo "Could not read the ISO volume label." >&2; exit 1; fi
`
      : `
LABEL=
`;
  const kernel =
    distro === "ubuntu"
      ? "casper/vmlinuz"
      : distro === "fedora"
        ? "images/pxeboot/vmlinuz"
        : "boot/grub/loopback.cfg";

  const lines = [
    "set -euo pipefail",
    RESOLVE_ISO,
    'TITLE=$2',
    'resolve_iso "$1"',
    fedora,
    `if ! bsdtar -tf "$ISO" | grep -qxE '(\\./)?${kernel}'; then echo "This ISO has no ${kernel}: choose another template." >&2; exit 1; fi`,
    `case $FSPATH in *[\\"\\\\\\$\\\`]*) echo "The ISO path contains a quote, backslash, dollar or backtick, which GRUB cannot take safely: $FSPATH" >&2; exit 1;; esac`,
    `case $FSTYPE in`,
    `  ext2|ext3|ext4) FSMOD=ext2;;`,
    `  vfat) FSMOD=fat;;`,
    `  *) FSMOD=$FSTYPE;;`,
    `esac`,
    `ENTRY=$(cat <<GRUB_LOOPBACK_ENTRY`,
    buildGrubEntry(distro),
    `GRUB_LOOPBACK_ENTRY`,
    `)`,
    'CUSTOM=/etc/grub.d/40_custom',
    'sudo touch "$CUSTOM"',
    `sudo sed -i '/${BEGIN}/,/${END}/d' "$CUSTOM"`,
    `printf '\\n${BEGIN}\\n%s\\n${END}\\n' "$ENTRY" | sudo tee -a "$CUSTOM" >/dev/null`,
    'sudo chmod +x "$CUSTOM"',
    `if command -v update-grub >/dev/null 2>&1; then sudo update-grub`,
    `elif command -v grub-mkconfig >/dev/null 2>&1; then sudo grub-mkconfig -o /boot/grub/grub.cfg`,
    `elif command -v grub2-mkconfig >/dev/null 2>&1; then sudo grub2-mkconfig -o /boot/grub2/grub.cfg`,
    `else echo "No grub-mkconfig, grub2-mkconfig or update-grub found." >&2; exit 1`,
    `fi`,
    reboot
      ? "sudo systemctl reboot"
      : 'echo "Done. Reboot and pick the new entry."',
  ];

  return lines.join("\n");
}
