#!/usr/bin/env bash
# DEPRECATED: Use `pf git branches` instead.
# This shim forwards to the Python CLI.
set -e
echo "DEPRECATED: create-feature-branches.sh — use 'pf git branches' instead" >&2
exec pf git branches "$@"
