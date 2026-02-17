#!/bin/bash
# DEPRECATED: Use `pf handoff phase-check <agent>` instead.
# This shim delegates to the Python implementation.
#
# Usage: phase-check-start.sh <agent>

echo "DEPRECATED: phase-check-start.sh — use 'pf handoff phase-check $1' instead" >&2
exec pf handoff phase-check "$@"
