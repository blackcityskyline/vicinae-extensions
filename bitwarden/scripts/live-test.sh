#!/usr/bin/env bash
# Ask for the Bitwarden master password, then run the live check with it.
#
#   ./scripts/live-test.sh
#
# The password is read with echo off and handed to the test through the
# environment, so it is not in the shell history, not in argv, and gone when
# the process exits. The test locks the vault again on the way out.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -t 0 ]; then
  echo "This asks for a password, so it needs a terminal." >&2
  exit 2
fi

read -rsp "Bitwarden master password: " BW_PASSWORD
echo
export BW_PASSWORD

exec npm run --silent test:live
