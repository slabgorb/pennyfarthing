#!/usr/bin/env bash
# DEPRECATED: Use `pf git status` instead.
echo "DEPRECATED: git-status-all.sh — use 'pf git status' instead" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf git status "$@"
