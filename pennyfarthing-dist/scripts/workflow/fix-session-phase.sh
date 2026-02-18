#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow fix-phase` instead.
echo "Warning: fix-session-phase.sh is deprecated. Use: pf workflow fix-phase $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow fix-phase "$@"
