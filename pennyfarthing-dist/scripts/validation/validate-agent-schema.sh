#!/usr/bin/env zsh
# validate-agent-schema.sh
# Validates agent files against schema and best practices
#
# Schema Rules:
# - Primary agents: Must have required XML tags, everything in tags
# - Subagents: Must have YAML frontmatter (validated separately)
#
# Best Practice Rules:
# - First <critical> within line 30
# - <on-activation> within line 100
# - File size under 300 lines
# - All XML tags properly closed
# - Checklists use proper markdown format
#
# Exit codes:
#   0 = All agents valid
#   1 = One or more agents invalid

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/pennyfarthing-dist/agents"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Primary agents (not subagents)
PRIMARY_AGENTS=(
    "sm.md"
    "tea.md"
    "dev.md"
    "reviewer.md"
    "orchestrator.md"
    "architect.md"
    "pm.md"
    "devops.md"
    "tech-writer.md"
    "ux-designer.md"
    "ba.md"
)

# Subagents (have YAML frontmatter, different schema)
SUBAGENTS=(
    "handoff.md"
    "sm-setup.md"
    "sm-finish.md"
    "sm-file-summary.md"
    "sm-handoff.md"
    "testing-runner.md"
    "reviewer-preflight.md"
)

# Required tags for primary agents
# Note: persona is emitted by agent-session.sh, not in agent files
REQUIRED_TAGS=(
    "role"
    "helpers"
    "exit"
)

# Optional but recommended tags
RECOMMENDED_TAGS=(
    "critical"
    "on-activation"
    "skills"
)

# Tags that require checklists
CHECKLIST_TAGS=(
    "gate"
    "handoff-gate"
    "self-review"
    "review-checklist"
)

# Mindset tags - each primary agent should have one
# Format: agent_file:expected_tag
declare -A MINDSET_TAGS=(
    ["sm.md"]="coordination-discipline"
    ["tea.md"]="test-paranoia"
    ["dev.md"]="minimalist-discipline"
    ["reviewer.md"]="adversarial-mindset"
    ["orchestrator.md"]="systems-thinking"
    ["architect.md"]="pragmatic-restraint"
    ["pm.md"]="ruthless-prioritization"
    ["devops.md"]="automation-discipline"
    ["tech-writer.md"]="clarity-obsession"
    ["ux-designer.md"]="consistency-guardian"
)

# Best practice thresholds
MAX_LINES=300
FIRST_CRITICAL_MAX_LINE=30
ON_ACTIVATION_MAX_LINE=100

# Counters
valid_count=0
warning_count=0
invalid_count=0

# Verbose mode
VERBOSE=false
FIX_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose) VERBOSE=true; shift ;;
        --fix) FIX_MODE=true; shift ;;
        -h|--help)
            echo "Usage: validate-agent-schema.sh [-v|--verbose] [--fix]"
            echo "  -v, --verbose  Show detailed validation info"
            echo "  --fix          Attempt to fix simple issues (not implemented)"
            exit 0
            ;;
        *) shift ;;
    esac
done

# =============================================================================
# Validation Functions
# =============================================================================

check_xml_tags_balanced() {
    local file="$1"
    local errors=()

    # Find all opening tags
    local open_tags=($(grep -oE '<[a-z][-a-z]*>' "$file" 2>/dev/null | sed 's/[<>]//g' | sort -u))

    for tag in "${open_tags[@]}"; do
        # grep -c returns 0 count but exit code 1 when no matches; use arithmetic to default to 0
        local open_count=$(($(grep -c "<${tag}>" "$file" 2>/dev/null) + 0))
        local close_count=$(($(grep -c "</${tag}>" "$file" 2>/dev/null) + 0))

        if [[ $open_count -ne $close_count ]]; then
            errors+=("Tag <$tag> has $open_count opens but $close_count closes")
        fi
    done

    if [[ ${#errors[@]} -gt 0 ]]; then
        for error in "${errors[@]}"; do
            echo "  ${YELLOW}→${NC} $error"
        done
        return 1
    fi
    return 0
}

check_required_tags() {
    local file="$1"
    local missing=()

    for tag in "${REQUIRED_TAGS[@]}"; do
        if ! grep -q "<${tag}>" "$file" 2>/dev/null; then
            missing+=("$tag")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "  ${RED}→${NC} Missing required tags: ${missing[*]}"
        return 1
    fi
    return 0
}

check_recommended_tags() {
    local file="$1"
    local missing=()

    for tag in "${RECOMMENDED_TAGS[@]}"; do
        if ! grep -q "<${tag}>" "$file" 2>/dev/null; then
            missing+=("$tag")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "  ${YELLOW}→${NC} Missing recommended tags: ${missing[*]}"
        return 1  # Warning, not error
    fi
    return 0
}

check_checklist_format() {
    local file="$1"
    local errors=()

    for tag in "${CHECKLIST_TAGS[@]}"; do
        if grep -q "<${tag}>" "$file" 2>/dev/null; then
            # Extract content between tags
            local content=$(sed -n "/<${tag}>/,/<\/${tag}>/p" "$file" 2>/dev/null)

            # Check for checklist items
            if echo "$content" | grep -qE '^\s*-\s*\['; then
                # Validate checklist format: - [ ] or - [x]
                local bad_format=$(echo "$content" | grep -E '^\s*-\s*\[' | grep -vE '^\s*-\s*\[\s*[x ]?\s*\]' || true)
                if [[ -n "$bad_format" ]]; then
                    errors+=("Tag <$tag> has malformed checklist items")
                fi
            fi
        fi
    done

    if [[ ${#errors[@]} -gt 0 ]]; then
        for error in "${errors[@]}"; do
            echo "  ${YELLOW}→${NC} $error"
        done
        return 1
    fi
    return 0
}

check_best_practices() {
    local file="$1"
    local filename=$(basename "$file")
    local warnings=()
    local errors=()

    # Check file length
    local line_count=$(wc -l < "$file" | tr -d ' ')
    if [[ $line_count -gt $MAX_LINES ]]; then
        errors+=("File has $line_count lines (max: $MAX_LINES)")
    fi

    # Check first <critical> position
    local first_critical=$(grep -n '<critical>' "$file" 2>/dev/null | head -1 | cut -d: -f1)
    if [[ -n "$first_critical" && $first_critical -gt $FIRST_CRITICAL_MAX_LINE ]]; then
        warnings+=("First <critical> at line $first_critical (target: ≤$FIRST_CRITICAL_MAX_LINE)")
    fi

    # Check <on-activation> position
    local on_activation=$(grep -n '<on-activation>' "$file" 2>/dev/null | head -1 | cut -d: -f1)
    if [[ -n "$on_activation" && $on_activation -gt $ON_ACTIVATION_MAX_LINE ]]; then
        warnings+=("<on-activation> at line $on_activation (target: ≤$ON_ACTIVATION_MAX_LINE)")
    fi

    # Check for content outside XML tags (after header)
    # Allow: # Header, blank lines, ## sections inside flows
    # This is a soft check - some content outside tags is OK

    # Report
    if [[ ${#errors[@]} -gt 0 ]]; then
        for error in "${errors[@]}"; do
            echo "  ${RED}→${NC} $error"
        done
    fi

    if [[ ${#warnings[@]} -gt 0 ]]; then
        for warning in "${warnings[@]}"; do
            echo "  ${YELLOW}→${NC} $warning"
        done
    fi

    [[ ${#errors[@]} -eq 0 ]]
}

check_header_format() {
    local file="$1"
    local filename=$(basename "$file" .md)

    # Check for proper header: # AgentName Agent - Title
    local header=$(head -1 "$file")
    if ! echo "$header" | grep -qE '^# .+ Agent'; then
        echo "  ${YELLOW}→${NC} Header should be '# Name Agent - Description'"
        return 1
    fi
    return 0
}

check_no_orphan_content() {
    local file="$1"
    local errors=()

    # Content after last closing tag is an error (except whitespace)
    local last_close_line=$(grep -n '</[a-z][-a-z]*>' "$file" 2>/dev/null | tail -1 | cut -d: -f1)
    local total_lines=$(wc -l < "$file" | tr -d ' ')

    if [[ -n "$last_close_line" ]]; then
        # Check if there's non-whitespace content after last tag
        local remaining=$(tail -n +$((last_close_line + 1)) "$file" | grep -v '^[[:space:]]*$' || true)
        if [[ -n "$remaining" ]]; then
            errors+=("Content found after last closing tag (line $last_close_line)")
        fi
    fi

    if [[ ${#errors[@]} -gt 0 ]]; then
        for error in "${errors[@]}"; do
            echo "  ${YELLOW}→${NC} $error"
        done
        return 1
    fi
    return 0
}

check_mindset_tag() {
    local file="$1"
    local filename=$(basename "$file")

    # Get expected mindset tag for this agent
    local expected_tag="${MINDSET_TAGS[$filename]:-}"

    if [[ -z "$expected_tag" ]]; then
        # No mindset tag expected for this agent
        return 0
    fi

    if ! grep -q "<${expected_tag}>" "$file" 2>/dev/null; then
        echo "  ${RED}→${NC} Missing mindset tag: <$expected_tag>"
        return 1
    fi

    # Verify it's closed
    if ! grep -q "</${expected_tag}>" "$file" 2>/dev/null; then
        echo "  ${RED}→${NC} Unclosed mindset tag: <$expected_tag>"
        return 1
    fi

    return 0
}

check_parameters_section() {
    local file="$1"

    # If file has <helpers> tag, it should also have <parameters>
    if grep -q "<helpers>" "$file" 2>/dev/null; then
        if ! grep -q "<parameters>" "$file" 2>/dev/null; then
            echo "  ${YELLOW}→${NC} Has <helpers> but missing <parameters> section"
            return 1
        fi
    fi
    return 0
}

check_arguments_section() {
    local file="$1"

    # Subagents should have <arguments> section
    if ! grep -q "<arguments>" "$file" 2>/dev/null; then
        echo "  ${YELLOW}→${NC} Missing <arguments> section"
        return 1
    fi

    # Verify it's closed
    if ! grep -q "</arguments>" "$file" 2>/dev/null; then
        echo "  ${RED}→${NC} Unclosed <arguments> tag"
        return 1
    fi

    return 0
}

check_all_content_in_tags() {
    local file="$1"
    local orphan_lines=()
    local in_tag=0
    local line_num=0

    while IFS= read -r line; do
        ((line_num++))

        # Skip header line (# Agent Name)
        [[ $line_num -eq 1 && $line =~ ^#\  ]] && continue

        # Skip blank lines
        [[ -z "${line// /}" ]] && continue

        # Count opening and closing tags on this line
        local opens=$(echo "$line" | grep -oE '<[a-z][-a-z]*>' | wc -l | tr -d ' ')
        local closes=$(echo "$line" | grep -oE '</[a-z][-a-z]*>' | wc -l | tr -d ' ')

        # If at depth 0 and line doesn't contain a tag, it's orphaned
        if [[ $in_tag -eq 0 && $opens -eq 0 ]]; then
            orphan_lines+=("$line_num")
        fi

        in_tag=$((in_tag + opens - closes))
    done < "$file"

    if [[ ${#orphan_lines[@]} -gt 0 ]]; then
        local first_few="${orphan_lines[*]:0:5}"
        echo "  ${RED}→${NC} Content outside XML tags at lines: $first_few..."
        return 1
    fi
    return 0
}

# =============================================================================
# Main Validation
# =============================================================================

validate_primary_agent() {
    local file="$1"
    local filename=$(basename "$file")
    local has_error=false
    local has_warning=false

    if [[ "$VERBOSE" == "true" ]]; then
        echo ""
        echo -e "${BLUE}Validating:${NC} $filename"
    fi

    # Required checks (errors)
    if ! check_xml_tags_balanced "$file"; then
        has_error=true
    fi

    if ! check_required_tags "$file"; then
        has_error=true
    fi

    # Best practice checks (can be warnings or errors)
    if ! check_best_practices "$file"; then
        has_error=true
    fi

    # All content must be within XML tags (required)
    if ! check_all_content_in_tags "$file"; then
        has_error=true
    fi

    # Mindset tag check (required)
    if ! check_mindset_tag "$file"; then
        has_error=true
    fi

    # Parameters section check (warning if helpers present)
    if ! check_parameters_section "$file"; then
        has_warning=true
    fi

    # Warning checks
    if ! check_recommended_tags "$file"; then
        has_warning=true
    fi

    if ! check_checklist_format "$file"; then
        has_warning=true
    fi

    if ! check_header_format "$file"; then
        has_warning=true
    fi

    # Report result
    if [[ "$has_error" == "true" ]]; then
        echo -e "${RED}✗ INVALID:${NC} $filename"
        ((invalid_count++))
        return 1
    elif [[ "$has_warning" == "true" ]]; then
        echo -e "${YELLOW}⚠ WARNING:${NC} $filename"
        ((warning_count++))
        return 0
    else
        echo -e "${GREEN}✓ VALID:${NC} $filename"
        ((valid_count++))
        return 0
    fi
}

validate_subagent() {
    local file="$1"
    local filename=$(basename "$file")

    # Check for YAML frontmatter
    local first_line=$(head -1 "$file")
    if [[ "$first_line" != "---" ]]; then
        echo -e "${RED}✗ INVALID:${NC} $filename (missing YAML frontmatter)"
        ((invalid_count++))
        return 1
    fi

    # Check for closing ---
    local frontmatter_end=$(awk '/^---$/{count++; if(count==2) print NR}' "$file")
    if [[ -z "$frontmatter_end" ]]; then
        echo -e "${RED}✗ INVALID:${NC} $filename (unclosed YAML frontmatter)"
        ((invalid_count++))
        return 1
    fi

    # Check required frontmatter fields
    local frontmatter=$(sed -n "2,$((frontmatter_end - 1))p" "$file")
    local missing=()

    for field in name description tools model; do
        if ! echo "$frontmatter" | grep -q "^${field}:"; then
            missing+=("$field")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}✗ INVALID:${NC} $filename (missing: ${missing[*]})"
        ((invalid_count++))
        return 1
    fi

    # Check XML tags are balanced
    if ! check_xml_tags_balanced "$file"; then
        echo -e "${RED}✗ INVALID:${NC} $filename"
        ((invalid_count++))
        return 1
    fi

    # Check for <arguments> section
    if ! check_arguments_section "$file"; then
        echo -e "${YELLOW}⚠ WARNING:${NC} $filename (subagent)"
        ((warning_count++))
        return 0
    fi

    echo -e "${GREEN}✓ VALID:${NC} $filename (subagent)"
    ((valid_count++))
    return 0
}

# =============================================================================
# Run Validation
# =============================================================================

echo "Agent Schema Validator"
echo "======================"
echo "Directory: $AGENTS_DIR"
echo ""

echo -e "${BLUE}Primary Agents:${NC}"
for agent in "${PRIMARY_AGENTS[@]}"; do
    if [[ -f "$AGENTS_DIR/$agent" ]]; then
        validate_primary_agent "$AGENTS_DIR/$agent" || true
    else
        echo -e "${YELLOW}⚠ MISSING:${NC} $agent"
        ((warning_count++))
    fi
done

echo ""
echo -e "${BLUE}Subagents:${NC}"
for subagent in "${SUBAGENTS[@]}"; do
    if [[ -f "$AGENTS_DIR/$subagent" ]]; then
        validate_subagent "$AGENTS_DIR/$subagent" || true
    else
        echo -e "${YELLOW}⚠ MISSING:${NC} $subagent"
        ((warning_count++))
    fi
done

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "====================================="
echo "Validation Summary"
echo "====================================="
total=$((${#PRIMARY_AGENTS[@]} + ${#SUBAGENTS[@]}))
echo -e "Valid:    ${GREEN}$valid_count${NC} / $total"
echo -e "Warnings: ${YELLOW}$warning_count${NC}"
echo -e "Invalid:  ${RED}$invalid_count${NC}"
echo ""

if [[ $invalid_count -eq 0 ]]; then
    if [[ $warning_count -eq 0 ]]; then
        echo -e "${GREEN}All agents pass schema validation!${NC}"
    else
        echo -e "${YELLOW}All agents valid with warnings.${NC}"
    fi
    exit 0
else
    echo -e "${RED}$invalid_count agent(s) failed validation.${NC}"
    exit 1
fi
