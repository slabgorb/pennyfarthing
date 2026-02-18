#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow show` instead.
echo "Warning: show-workflow.sh is deprecated. Use: pf workflow show $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow show "$@"
