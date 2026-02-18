#!/bin/bash
# DEPRECATED: Use `pf sprint story finish` instead.
set -euo pipefail
echo "DEPRECATED: finish-story.sh is deprecated. Forwarding to 'pf sprint story finish'." >&2
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf sprint story finish "$@"
