#!/usr/bin/env bash
# DEPRECATED: Use `pf git worktree` instead.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf git worktree "$@"
