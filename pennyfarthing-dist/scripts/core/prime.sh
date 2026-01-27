#!/usr/bin/env bash
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Thin wrapper around python -m pennyfarthing_scripts.prime

# Find the package root (where pennyfarthing_scripts lives)
# Works for both npm installs (node_modules/@pennyfarthing/core) and local dev
# Use pwd -P to resolve symlinks in the path (handles symlinked parent dirs)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd -P)"

# Set PYTHONPATH so Python can find pennyfarthing_scripts
export PYTHONPATH="${PACKAGE_ROOT}:${PYTHONPATH:-}"

exec python3 -m pennyfarthing_scripts.prime "$@"
