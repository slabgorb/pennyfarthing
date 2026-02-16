#!/usr/bin/env bash
# DEPRECATED: Use `pf git status` instead.
# This shim forwards to the Python CLI.
set -e
echo "DEPRECATED: git-status-all.sh — use 'pf git status' instead" >&2
exec pf git status "$@"
