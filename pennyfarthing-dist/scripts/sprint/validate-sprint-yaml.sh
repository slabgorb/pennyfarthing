#!/usr/bin/env zsh
# validate-sprint-yaml.sh - Validate sprint YAML files for common issues
#
# Story MSSCI-14192 - Sprint panel YAML parsing fix
#
# Usage:
#   validate-sprint-yaml.sh [path/to/sprint/current-sprint.yaml]
#
# If no path provided, looks for sprint/current-sprint.yaml in current directory.
#
# Common issues detected:
# - YAML syntax errors (including single-quoted strings with blank lines)
# - Missing required fields

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Find sprint YAML file
SPRINT_FILE="${1:-sprint/current-sprint.yaml}"

if [[ ! -f "$SPRINT_FILE" ]]; then
  echo -e "${RED}ERROR:${NC} Sprint file not found: $SPRINT_FILE"
  exit 1
fi

echo "Validating: $SPRINT_FILE"
echo ""

# Track errors
ERRORS=0

# Main validation using node
validate_yaml() {
  local file="$1"

  if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}WARNING:${NC} node not available for YAML validation"
    return 0
  fi

  local result
  result=$(node -e "
    const { readFileSync } = require('fs');
    const { parse } = require('yaml');

    const file = '$file';

    try {
      const content = readFileSync(file, 'utf-8');
      const data = parse(content);

      // Check for sprint section
      if (!data.sprint) {
        console.log('WARN:Missing sprint section');
      }

      // Check for epics array
      if (!Array.isArray(data.epics)) {
        console.log('ERROR:epics is not an array or missing');
      } else if (data.epics.length === 0) {
        console.log('WARN:No epics found in sprint');
      } else {
        // Count epics and stories
        let storyCount = 0;
        data.epics.forEach((epic, i) => {
          if (!epic.id) console.log('WARN:Epic ' + i + ' missing id');
          if (!epic.title) console.log('WARN:Epic ' + i + ' missing title');
          if (Array.isArray(epic.stories)) {
            storyCount += epic.stories.length;
          }
        });
        console.log('INFO:Found ' + data.epics.length + ' epic(s) with ' + storyCount + ' total stories');
      }

      console.log('SUCCESS');
    } catch (err) {
      const line = err.linePos?.[0]?.line || '?';
      console.log('PARSE_ERROR:' + line + ':' + err.message);

      // Provide hint for common single-quote issue
      if (err.message && err.message.includes('quote')) {
        console.log('HINT:Single-quoted YAML strings cannot contain blank lines. Use literal block scalar (|) instead.');
      }
    }
  " 2>&1)

  # Process output
  local success=false
  echo "$result" | while IFS= read -r line; do
    case "$line" in
      SUCCESS)
        success=true
        ;;
      PARSE_ERROR:*)
        local info="${line#PARSE_ERROR:}"
        local line_num="${info%%:*}"
        local message="${info#*:}"
        echo -e "${RED}ERROR:${NC} YAML syntax error at line $line_num"
        echo "  $message"
        ERRORS=$((ERRORS + 1))
        ;;
      HINT:*)
        echo -e "${YELLOW}TIP:${NC} ${line#HINT:}"
        ;;
      ERROR:*)
        echo -e "${RED}ERROR:${NC} ${line#ERROR:}"
        ERRORS=$((ERRORS + 1))
        ;;
      WARN:*)
        echo -e "${YELLOW}WARNING:${NC} ${line#WARN:}"
        ;;
      INFO:*)
        echo -e "${GREEN}✓${NC} ${line#INFO:}"
        ;;
    esac
  done

  # Check exit status from subshell
  if echo "$result" | grep -q "^PARSE_ERROR:" || echo "$result" | grep -q "^ERROR:"; then
    return 1
  fi
  return 0
}

# Run validation
if validate_yaml "$SPRINT_FILE"; then
  echo ""
  echo -e "${GREEN}✓ Sprint YAML is valid${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}✗ Validation failed${NC}"
  exit 1
fi
