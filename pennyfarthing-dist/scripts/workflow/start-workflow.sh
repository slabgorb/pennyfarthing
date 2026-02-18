#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow start` instead.
echo "Warning: start-workflow.sh is deprecated. Use: pf workflow start $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow start "$@"
