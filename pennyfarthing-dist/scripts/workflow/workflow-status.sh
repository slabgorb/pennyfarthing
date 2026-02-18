#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow status` instead.
echo "Warning: workflow-status.sh is deprecated. Use: pf workflow status $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow status "$@"
