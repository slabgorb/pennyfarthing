#!/bin/bash
# DEPRECATED: Use `pf workflow type` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: get-workflow-type.sh is deprecated. Use: pf workflow type $*" >&2
exec pf workflow type "$@"
