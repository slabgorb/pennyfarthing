#!/bin/bash
# compute-theme-tiers.sh - Shell wrapper for compute-theme-tiers.js
# Computes tier rankings from job-fair results and updates theme files
#
# Uses the MOST COMPLETE run for each theme (most matrix entries),
# not the most recent. This prevents incomplete runs from overriding good data.
#
# All logic is implemented in compute-theme-tiers.js (Node.js)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/compute-theme-tiers.js" "$@"
