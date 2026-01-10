#!/bin/bash
# benchmark-runner.sh - Shell wrapper for benchmark-runner.js
# This wrapper ensures the tests can call benchmark-runner.sh as expected
#
# All logic is implemented in benchmark-runner.js (Node.js)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/benchmark-runner.js" "$@"
