#!/usr/bin/env bash
# compute-theme-tiers.sh - Compute tier rankings from job-fair results
#
# Uses the MOST COMPLETE run for each theme (most matrix entries),
# not the most recent. This prevents incomplete runs from overriding good data.
#
# Usage: compute-theme-tiers.sh [--dry-run] [--verbose] [--min-entries N]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/compute_theme_tiers.py" "$@"
