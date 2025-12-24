#!/bin/bash
# Pre-edit hook: Verify edits don't touch protected files
# Called by Claude Code before Edit/Write tool calls
#
# Input: JSON via stdin with tool_name, tool_input
# Output: Exit 0 to allow, Exit 2 to block (stderr shown to Claude)

set -euo pipefail

# Read input from stdin
input=$(cat)

# Extract file path from tool input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Protected patterns (files that should never be edited automatically)
protected_patterns=(
    "*.env"
    "*.pem"
    "*.key"
    "*credentials*"
    "*secrets*"
    ".git/*"
    "node_modules/*"
    "vendor/*"
)

# Pennyfarthing managed files protection
# These are managed by `pennyfarthing update`, don't edit directly
if [[ "$file_path" == *".claude/pennyfarthing/"* ]]; then
    echo "BLOCKED: Cannot edit managed pennyfarthing files." >&2
    echo "File: $file_path" >&2
    echo "" >&2
    echo "These files are managed by pennyfarthing and will be overwritten on update." >&2
    echo "Instead:" >&2
    echo "  - Put project-specific customizations in .claude/project/" >&2
    echo "  - For framework changes, edit the pennyfarthing repo and run 'pennyfarthing update'" >&2
    exit 2
fi

# Check if file matches any protected pattern
for pattern in "${protected_patterns[@]}"; do
    if [[ "$file_path" == $pattern ]]; then
        echo "BLOCKED: Cannot edit protected file matching pattern: $pattern" >&2
        echo "File: $file_path" >&2
        exit 2
    fi
done

# Additional check: warn on certain file types but allow
warn_patterns=(
    "*.md"
    "*.json"
)

# For warnings, just log to stderr but allow (exit 0)
for pattern in "${warn_patterns[@]}"; do
    if [[ "$file_path" == $pattern ]]; then
        # Could log warnings here if needed
        :
    fi
done

# Allow the edit
exit 0
