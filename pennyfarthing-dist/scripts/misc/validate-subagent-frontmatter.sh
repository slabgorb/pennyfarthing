#!/usr/bin/env zsh
# validate-subagent-frontmatter.sh
# Validates that subagent files use official YAML frontmatter format
#
# Expected format:
#   ---
#   name: subagent-name
#   description: What it does
#   tools: Bash, Read, Glob, Grep
#   model: haiku
#   ---
#   [system prompt content]
#
# Exit codes:
#   0 = All subagents valid
#   1 = One or more subagents invalid

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SUBAGENTS_DIR="$PROJECT_ROOT/agents"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Required fields in frontmatter
REQUIRED_FIELDS=("name" "description" "tools" "model")

# Expected subagent files (7 total - consolidated in Story 31-11/31-12)
EXPECTED_SUBAGENTS=(
    "sm-setup.md"
    "sm-finish.md"
    "sm-file-summary.md"
    "sm-handoff.md"
    "handoff.md"
    "reviewer-preflight.md"
    "testing-runner.md"
)

# Counters
valid_count=0
invalid_count=0
missing_count=0

echo "Validating subagent YAML frontmatter format..."
echo "Directory: $SUBAGENTS_DIR"
echo ""

validate_file() {
    local file="$1"
    local filename=$(basename "$file")
    local errors=()

    # Check file exists
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}✗ MISSING:${NC} $filename"
        ((missing_count++))
        return 1
    fi

    # Check for opening ---
    local first_line=$(head -1 "$file")
    if [[ "$first_line" != "---" ]]; then
        errors+=("Missing opening '---' delimiter (found: '$first_line')")
    fi

    # Extract frontmatter (between first and second ---)
    local frontmatter=""
    local in_frontmatter=false
    local line_num=0
    local frontmatter_end=0

    while IFS= read -r line; do
        ((line_num++))
        if [[ $line_num -eq 1 ]]; then
            if [[ "$line" == "---" ]]; then
                in_frontmatter=true
            fi
            continue
        fi

        if [[ "$in_frontmatter" == true ]]; then
            if [[ "$line" == "---" ]]; then
                frontmatter_end=$line_num
                break
            fi
            frontmatter+="$line"$'\n'
        fi
    done < "$file"

    if [[ $frontmatter_end -eq 0 ]]; then
        errors+=("Missing closing '---' delimiter")
    fi

    # Check required fields
    for field in "${REQUIRED_FIELDS[@]}"; do
        if ! echo "$frontmatter" | grep -q "^${field}:"; then
            errors+=("Missing required field: $field")
        fi
    done

    # Validate name matches filename (without .md)
    local expected_name="${filename%.md}"
    if echo "$frontmatter" | grep -q "^name:"; then
        local actual_name=$(echo "$frontmatter" | grep "^name:" | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'")
        if [[ "$actual_name" != "$expected_name" ]]; then
            errors+=("Name mismatch: expected '$expected_name', found '$actual_name'")
        fi
    fi

    # Validate model is haiku
    if echo "$frontmatter" | grep -q "^model:"; then
        local model=$(echo "$frontmatter" | grep "^model:" | sed 's/^model:[[:space:]]*//' | tr -d '"' | tr -d "'")
        if [[ "$model" != "haiku" ]]; then
            errors+=("Model should be 'haiku', found '$model'")
        fi
    fi

    # Report results
    if [[ ${#errors[@]} -eq 0 ]]; then
        echo -e "${GREEN}✓ VALID:${NC} $filename"
        ((valid_count++))
        return 0
    else
        echo -e "${RED}✗ INVALID:${NC} $filename"
        for error in "${errors[@]}"; do
            echo -e "  ${YELLOW}→${NC} $error"
        done
        ((invalid_count++))
        return 1
    fi
}

# Validate each expected subagent
for subagent in "${EXPECTED_SUBAGENTS[@]}"; do
    validate_file "$SUBAGENTS_DIR/$subagent" || true
done

echo ""
echo "====================================="
echo "Validation Summary"
echo "====================================="
echo -e "Valid:   ${GREEN}$valid_count${NC} / ${#EXPECTED_SUBAGENTS[@]}"
echo -e "Invalid: ${RED}$invalid_count${NC}"
echo -e "Missing: ${RED}$missing_count${NC}"
echo ""

if [[ $invalid_count -eq 0 && $missing_count -eq 0 ]]; then
    echo -e "${GREEN}All subagents have valid YAML frontmatter!${NC}"
    exit 0
else
    echo -e "${RED}Some subagents need migration to YAML frontmatter format.${NC}"
    exit 1
fi
