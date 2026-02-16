#!/bin/bash
# DEPRECATED: Use `pf workflow resume` instead.
# This shim forwards to the Python CLI for backward compatibility.
echo "Warning: resume-workflow.sh is deprecated. Use: pf workflow resume $*" >&2
exec pf workflow resume "$@"
