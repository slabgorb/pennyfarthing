#!/bin/bash
#
# Sprint YAML Validation Hook (PostToolUse)
#
# Validates sprint YAML files after Edit/Write operations to ensure
# compatibility with the yaml npm package used by Cyclist's SprintPanel.
#
# The yaml npm package follows YAML 1.2 strictly and rejects:
# - Single-quoted strings with blank lines
# - Invalid multiline string formats
#
# When validation fails, returns additionalContext with an error message
# prompting the agent to fix the YAML format.
#
# Input: JSON via stdin with tool_name, tool_input
# Output: JSON with additionalContext on validation failure
#
# See also: pf sprint validate

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract tool name and file path from input
TOOL_NAME=$(echo "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "")
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "")

# Only process Edit and Write operations on sprint YAML files
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  exit 0
fi

# Check if it's a sprint YAML file
if [[ ! "$FILE_PATH" =~ sprint/.*\.(yaml|yml)$ ]]; then
  exit 0
fi

# Check if the file exists
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Validate using Node.js yaml package (same parser Cyclist uses)
VALIDATION_ERROR=$(node --input-type=module -e "
import { parse } from 'yaml';
import { readFileSync } from 'fs';

try {
  const content = readFileSync('$FILE_PATH', 'utf-8');
  parse(content);
  process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
" 2>&1) && VALID=true || VALID=false

if [[ "$VALID" == "true" ]]; then
  # Valid YAML - exit silently
  exit 0
fi

# Validation failed - return error context to agent
# Escape special characters for JSON
ESCAPED_ERROR=$(echo "$VALIDATION_ERROR" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr '\n' ' ')
ESCAPED_PATH=$(echo "$FILE_PATH" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "⚠️ SPRINT YAML VALIDATION FAILED\n\nFile: $ESCAPED_PATH\nError: $ESCAPED_ERROR\n\nThe sprint YAML file has invalid syntax that will break the Cyclist SprintPanel.\n\nCommon fix: Single-quoted strings cannot contain blank lines in YAML 1.2.\nUse literal block scalars (|) for multiline strings instead.\n\nTo auto-fix, run: yq eval -o=json '$ESCAPED_PATH' > /tmp/sprint.json && yq eval -P /tmp/sprint.json > '$ESCAPED_PATH'"
  }
}
EOF

exit 0
