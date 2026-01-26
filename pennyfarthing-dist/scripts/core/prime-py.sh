#!/usr/bin/env bash
# prime-py.sh - Python implementation of prime.sh
# Usage: prime-py.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Thin wrapper around python -m pennyfarthing_scripts.prime
# Provides identical interface to prime.sh

exec python3 -m pennyfarthing_scripts.prime "$@"
