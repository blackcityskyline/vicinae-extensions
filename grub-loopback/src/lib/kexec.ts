export function buildKexecScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

ISO="$1"
if [ ! -f "$ISO" ]; then
  echo "ISO not found: $ISO"
  exit 1
fi

MP=$(findmnt -T "$ISO" -no TARGET)
DEV=$(findmnt -T "$ISO" -no SOURCE)
UUID=$(blkid -s UUID -o value "$DEV")
REL="\${ISO#$MP}"
if [ "$REL" = "$ISO" ]; then
  REL="/$(basename "$ISO")"
fi

CFG=$(mktemp)
bsdtar -xOf "$ISO" boot/grub/loopback.cfg > "$CFG" 2>/dev/null || {
  echo "No boot/grub/loopback.cfg in ISO"
  rm -f "$CFG"
  exit 1
}

SECTION=$(sed -n '/^menuentry /,/^}/p' "$CFG" | head -n 40)
LINUX_LINE=$(printf '%s\\n' "$SECTION" | grep -E '^[[:space:]]*linux[[:space:]]' | head -n 1)
INITRD_LINE=$(printf '%s\\n' "$SECTION" | grep -E '^[[:space:]]*initrd[[:space:]]' | head -n 1)

KERNEL_ISO=$(printf '%s\\n' "$LINUX_LINE" | awk '{print $2}')
CMDLINE=$(printf '%s\\n' "$LINUX_LINE" | cut -d' ' -f3-)
INITRD_ISO=$(printf '%s\\n' "$INITRD_LINE" | awk '{print $2}')

if [ -z "$KERNEL_ISO" ] || [ -z "$INITRD_ISO" ]; then
  echo "Could not parse kernel/initrd from loopback.cfg"
  rm -f "$CFG"
  exit 1
fi

CMDLINE="\${CMDLINE//\\$\\{archiso_img_dev_uuid\\}/$UUID}"
CMDLINE="\${CMDLINE//\\$\\{iso_path\\}/$REL}"
CMDLINE="\${CMDLINE//\\$\\{img_loop\\}/$REL}"
CMDLINE="$CMDLINE nomodeset loglevel=7"

TMP=$(mktemp -d)
bsdtar -xOf "$ISO" "\${KERNEL_ISO#/}" > "$TMP/vmlinuz"
bsdtar -xOf "$ISO" "\${INITRD_ISO#/}" > "$TMP/initrd"

echo "Kernel: $KERNEL_ISO"
echo "Initrd: $INITRD_ISO"
echo "img_dev UUID: $UUID"
echo "img_loop: $REL"
echo "Cmdline: $CMDLINE"

sudo kexec -l "$TMP/vmlinuz" --initrd="$TMP/initrd" --command-line="$CMDLINE"
echo
echo "kexec loaded. Press Enter to boot now (this kills the current session), or Ctrl+C to cancel."
read -r _
sudo kexec -e
`;
}
