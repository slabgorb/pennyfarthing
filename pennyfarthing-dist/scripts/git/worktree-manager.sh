#!/usr/bin/env bash
# DEPRECATED: Use `pf git worktree` instead.
# This shim forwards to the Python CLI.
set -e
echo "DEPRECATED: worktree-manager.sh — use 'pf git worktree' instead" >&2
exec pf git worktree "$@"
