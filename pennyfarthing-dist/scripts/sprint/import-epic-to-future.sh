#!/usr/bin/env bash
# import-epic-to-future.sh - Import epics-and-stories workflow output to future.yaml
#
# Usage: ./scripts/sprint/import-epic-to-future.sh [--dry-run] <epics-md-file> [initiative-name]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 "$SCRIPT_DIR/import_epic_to_future.py" "$@"
