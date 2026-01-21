#!/usr/bin/env bash
# migrate-bmad-workflow.sh - Thin wrapper for migrate-bmad-workflow.mjs
#
# Usage: ./scripts/migrate-bmad-workflow.sh [--dry-run] <source-dir> [target-dir]
#
# Delegates to Node script for cleaner YAML parsing and variable conversion.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "${SCRIPT_DIR}/migrate-bmad-workflow.mjs" "$@"
