#!/bin/bash
# aggregate-benchmark-stats.sh - Shell wrapper for aggregate-benchmark-stats.js
# Aggregates job-fair results into unified benchmark statistics
#
# All logic is implemented in aggregate-benchmark-stats.js (Node.js)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/aggregate-benchmark-stats.js" "$@"
