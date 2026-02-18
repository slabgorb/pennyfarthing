#!/usr/bin/env bash
# DEPRECATED: Use `pf workflow type` instead.
echo "Warning: get-workflow-type.sh is deprecated. Use: pf workflow type $*" >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf workflow type "$@"
