#!/bin/bash
# DEPRECATED: Use `pf workflow status` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: workflow-status.sh is deprecated. Use: pf workflow status $*" >&2
exec pf workflow status "$@"
