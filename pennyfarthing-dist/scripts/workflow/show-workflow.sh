#!/bin/bash
# DEPRECATED: Use `pf workflow show` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: show-workflow.sh is deprecated. Use: pf workflow show $*" >&2
exec pf workflow show "$@"
