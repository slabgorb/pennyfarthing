#!/usr/bin/env bash
# import-epic-to-future.sh - Thin wrapper for import-epic-to-future.mjs
#
# Usage: ./scripts/sprint/import-epic-to-future.sh [--dry-run] <epics-md-file> [initiative-name]
#
# Delegates to Node script for cleaner markdown parsing and YAML generation.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/import-epic-to-future.mjs" "$@"
