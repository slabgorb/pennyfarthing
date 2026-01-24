#!/usr/bin/env bash
#
# Question Reflector Enforcement Hook (Stop hook / PreToolUse hook)
#
# Thin wrapper that delegates to question-reflector-check.mjs for the actual logic.
# This allows the hook to be written in JavaScript for easier testing and maintenance.
#
# Input (stdin): JSON with transcript_path, stop_hook_active, etc.
# Output (stdout): JSON decision to allow or block
#
# Story: MSSCI-12393
#

set -euo pipefail

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Delegate to JavaScript implementation
exec node "$SCRIPT_DIR/question-reflector-check.mjs"
