#!/usr/bin/env bash
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Thin wrapper around python -m pennyfarthing_scripts.prime

exec python3 -m pennyfarthing_scripts.prime "$@"
