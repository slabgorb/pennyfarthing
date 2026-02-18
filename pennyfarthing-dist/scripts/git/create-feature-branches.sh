#!/usr/bin/env bash
# DEPRECATED: Use `pf git branches` instead.
echo "DEPRECATED: create-feature-branches.sh — use 'pf git branches' instead" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf git branches "$@"
