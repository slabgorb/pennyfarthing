#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow list` instead.
echo "Warning: list-workflows.sh is deprecated. Use: pf workflow list" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow list "$@"
