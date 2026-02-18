#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow phase-check` instead.
echo "Warning: phase-owner.sh is deprecated. Use: pf workflow phase-check $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow phase-check "$@"
