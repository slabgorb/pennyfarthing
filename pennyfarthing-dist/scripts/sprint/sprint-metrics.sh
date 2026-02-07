#!/usr/bin/env bash
# Sprint metrics calculator
# Usage: ./sprint-metrics.sh [--json]
#
# Delegates to Python CLI: pennyfarthing_scripts.cli sprint metrics

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.cli sprint metrics "$@"
