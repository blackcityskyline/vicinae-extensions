/**
 * Bash that locates an ISO the way GRUB and an initramfs will see it:
 * the filesystem UUID, the filesystem type, and the path inside that
 * filesystem (not the path under the mount point).
 *
 * The two differ whenever the mount is a btrfs subvolume or a bind mount:
 * with `/home` mounted from subvolume `@home`, `/home/me/x.iso` is
 * `/@home/me/x.iso` to GRUB. The in-filesystem root of a mount is field 4 of
 * /proc/self/mountinfo. GRUB and initramfs scripts mount without `subvol=`, so
 * they see the filesystem's default subvolume as `/`; on btrfs that prefix is
 * stripped too.
 *
 * Defines `resolve_iso <path>`, which sets ISO, FSTYPE, UUID and FSPATH.
 */
export const RESOLVE_ISO = `
unescape_mountinfo() { printf '%b' "\${1//\\\\/\\\\0}"; }

resolve_iso() {
  local mp root rest tail src fstype best_mp="" best_root="" best_src="" best_fs="" rel defsub
  ISO=$(readlink -f -- "$1")
  if [ ! -f "$ISO" ]; then echo "ISO not found: $1" >&2; return 1; fi

  while read -r _ _ _ root mp rest; do
    mp=$(unescape_mountinfo "$mp")
    if [ "$mp" != / ] && [[ $ISO != "$mp"/* ]]; then continue; fi
    if [ \${#mp} -ge \${#best_mp} ]; then
      tail=\${rest#* - }
      read -r fstype src _ <<<"$tail"
      best_mp=$mp
      best_root=$(unescape_mountinfo "$root")
      best_src=$(unescape_mountinfo "$src")
      best_fs=$fstype
    fi
  done < /proc/self/mountinfo

  if [ -z "$best_src" ]; then echo "No mount found for $ISO" >&2; return 1; fi
  FSTYPE=$best_fs
  if [ "$best_mp" = / ]; then rel=$ISO; else rel=\${ISO#"$best_mp"}; fi
  if [ "$best_root" = / ]; then FSPATH=$rel; else FSPATH=$best_root$rel; fi

  UUID=$(sudo blkid -s UUID -o value "$best_src")
  if [ -z "$UUID" ]; then echo "No filesystem UUID for $best_src" >&2; return 1; fi

  case $best_src in
    /dev/mapper/*|/dev/dm-*) echo "Warning: $best_src is a mapped device (LUKS/LVM). GRUB and the initramfs may not be able to open it." >&2;;
  esac

  if [ "$FSTYPE" = btrfs ]; then
    defsub=$(sudo btrfs subvolume get-default "$best_mp" | sed -n 's/^ID [0-9]* gen [0-9]* top level [0-9]* path //p')
    if [ -n "$defsub" ]; then
      case $FSPATH in
        /"$defsub"/*) FSPATH=\${FSPATH#/"$defsub"};;
        *) echo "$ISO is outside the default btrfs subvolume (/$defsub); GRUB and the initramfs cannot reach it." >&2; return 1;;
      esac
    fi
  fi
}
`;
