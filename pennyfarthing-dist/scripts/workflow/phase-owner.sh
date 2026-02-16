#!/bin/bash
# DEPRECATED: Use `pf workflow phase-check` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: phase-owner.sh is deprecated. Use: pf workflow phase-check $*" >&2
exec pf workflow phase-check "$@"
