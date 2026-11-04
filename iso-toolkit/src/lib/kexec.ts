import { RESOLVE_ISO } from "~/lib/resolve";

/**
 * Run as `bash <script> <iso> [nomodeset]`.
 *
 * Reads the ISO's own boot/grub/loopback.cfg, takes its first menuentry, and
 * loads that kernel and initrd with kexec.
 *
 * The final step is `systemctl kexec`, not `kexec -e`: it stops services and
 * unmounts first, and runs the drivers' shutdown hooks, so the next kernel finds
 * the GPU quiesced. `nomodeset` is opt-in, because it stops the new kernel's
 * native driver from lighting the panel, which leaves a dark screen after a
 * kexec from a running desktop.
 */
export function buildKexecScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail
${RESOLVE_ISO}
fail() { echo "$1" >&2; exit 1; }

for tool in bsdtar kexec; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is not installed."
done

resolve_iso "$1"
SAFE_GRAPHICS=\${2:-}

CFG=$(bsdtar -xOf "$ISO" boot/grub/loopback.cfg 2>/dev/null) || fail "No boot/grub/loopback.cfg in this ISO."

BLOCK=$(printf '%s\\n' "$CFG" | awk '/^[[:space:]]*menuentry[[:space:]]/{n++} n==1{print} n==1 && /^[[:space:]]*}/{exit}')
LINUX_LINE=$(printf '%s\\n' "$BLOCK" | grep -E '^[[:space:]]*linux(efi)?[[:space:]]' | head -n 1 || true)
INITRD_LINE=$(printf '%s\\n' "$BLOCK" | grep -E '^[[:space:]]*initrd(efi)?[[:space:]]' | head -n 1 || true)
[ -n "$LINUX_LINE" ] && [ -n "$INITRD_LINE" ] || fail "No linux/initrd lines in the first menuentry of loopback.cfg."

read -r -a LINUX_WORDS <<<"$LINUX_LINE"
read -r -a INITRD_WORDS <<<"$INITRD_LINE"
KERNEL=\${LINUX_WORDS[1]}
CMDLINE=\${LINUX_WORDS[*]:2}
INITRDS=("\${INITRD_WORDS[@]:1}")

CMDLINE=\${CMDLINE//\\"/}
CMDLINE=\${CMDLINE//'\${iso_path}'/$FSPATH}
CMDLINE=\${CMDLINE//'$iso_path'/$FSPATH}
CMDLINE=\${CMDLINE//'\${archiso_img_dev_uuid}'/$UUID}
CMDLINE=\${CMDLINE//'$archiso_img_dev_uuid'/$UUID}
if [ "$SAFE_GRAPHICS" = nomodeset ]; then CMDLINE="$CMDLINE nomodeset"; fi

iso_member() { local p=$1; p=\${p#\\(*\\)}; printf '%s' "\${p#/}"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
bsdtar -xOf "$ISO" "$(iso_member "$KERNEL")" > "$TMP/vmlinuz" || fail "Cannot extract the kernel $KERNEL."
for f in "\${INITRDS[@]}"; do
  bsdtar -xOf "$ISO" "$(iso_member "$f")" >> "$TMP/initrd" || fail "Cannot extract the initrd $f."
done

echo "ISO:     $ISO"
echo "Device:  UUID=$UUID ($FSTYPE)"
echo "In fs:   $FSPATH"
echo "Kernel:  $KERNEL"
echo "Initrd:  \${INITRDS[*]}"
echo "Cmdline: $CMDLINE"
case $CMDLINE in *'$'*) echo "Warning: the command line still has GRUB variables; this ISO may not boot." >&2;; esac
case $FSPATH in *[[:space:]]*) echo "Warning: the ISO path has spaces; kernel parameters cannot carry them." >&2;; esac

if sudo kexec -s -l "$TMP/vmlinuz" --initrd="$TMP/initrd" --command-line="$CMDLINE"; then
  echo "Loaded with kexec_file_load."
elif sudo kexec -l "$TMP/vmlinuz" --initrd="$TMP/initrd" --command-line="$CMDLINE"; then
  echo "Loaded with kexec_load."
else
  fail "kexec could not load the kernel."
fi
rm -rf "$TMP"

echo
echo "Press Enter to boot now. Unsaved work in this session is lost. Ctrl+C cancels."
read -r _
sync
if command -v systemctl >/dev/null 2>&1; then sudo systemctl kexec; else sudo kexec -e; fi
`;
}
