#!/bin/bash
# DEPRECATED: Use `pf workflow start` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: start-workflow.sh is deprecated. Use: pf workflow start $*" >&2
exec pf workflow start "$@"
