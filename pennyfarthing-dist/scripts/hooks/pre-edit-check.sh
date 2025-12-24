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

# Pennyfarthing submodule protection
# Edit pennyfarthing files in the pennyfarthing repo, not consuming projects
if [[ "$file_path" == *".claude/pennyfarthing/"* ]]; then
    echo "BLOCKED: Cannot edit pennyfarthing submodule files from this repo." >&2
    echo "File: $file_path" >&2
    echo "" >&2
    echo "To modify pennyfarthing:" >&2
    echo "  1. cd .claude/pennyfarthing" >&2
    echo "  2. Make changes there" >&2
    echo "  3. Commit and push to pennyfarthing repo" >&2
    echo "  4. Update submodule reference in parent: git add .claude/pennyfarthing" >&2
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
