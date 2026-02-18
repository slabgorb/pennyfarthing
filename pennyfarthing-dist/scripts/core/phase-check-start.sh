#!/bin/bash
# DEPRECATED: Use `pf handoff phase-check <agent>` instead.
echo "DEPRECATED: phase-check-start.sh — use 'pf handoff phase-check $1' instead" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf handoff phase-check "$@"
