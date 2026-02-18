#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow resume` instead.
echo "Warning: resume-workflow.sh is deprecated. Use: pf workflow resume $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow resume "$@"
