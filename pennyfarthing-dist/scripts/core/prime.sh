#!/usr/bin/env bash
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/../lib/run-pf.sh"
exec_pf prime "$@"
