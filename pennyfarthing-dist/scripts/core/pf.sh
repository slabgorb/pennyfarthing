#!/usr/bin/env bash
# Wrapper: run `pf` CLI via uv run — no global pf install needed.
# Usage: "$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh <command> [args...]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf "$@"
