#!/usr/bin/env bash
# Cyclist PreToolUse Hook - Shell wrapper for Python implementation
# Calls pretooluse_hook.py which handles WheelHub communication
# Story: MSSCI-14320

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/../pretooluse_hook.py"
