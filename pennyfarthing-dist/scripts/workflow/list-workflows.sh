#!/bin/bash
# DEPRECATED: Use `pf workflow list` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: list-workflows.sh is deprecated. Use: pf workflow list" >&2
exec pf workflow list "$@"
