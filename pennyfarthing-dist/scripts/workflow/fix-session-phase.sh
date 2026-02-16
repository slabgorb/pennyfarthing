#!/bin/bash
# DEPRECATED: Use `pf workflow fix-phase` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: fix-session-phase.sh is deprecated. Use: pf workflow fix-phase $*" >&2
exec pf workflow fix-phase "$@"
