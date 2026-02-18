#!/usr/bin/env bash
# DEPRECATED: Use `pf git install-hooks` instead.
echo "DEPRECATED: install-git-hooks.sh — use 'pf git install-hooks' instead" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf git install-hooks "$@"
