#!/bin/bash
# test_character_lookup.sh - Unit tests for find_character_in_theme()
# Tests the character lookup logic used by solo-runner.sh --as flag

# Don't exit on error for test script - we handle failures ourselves

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures"

# Create temp theme file for testing
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

THEME_FILE="$TMPDIR/mock-theme.yaml"

# Copy base fixture and allow modifications
cp "$FIXTURE_DIR/mock-theme.yaml" "$THEME_FILE"

# Inline the find_character_in_theme function from solo-runner.sh
find_character_in_theme() {
    local theme_file="$1"
    local query="$2"

    # Search all agents for matching character (case-insensitive)
    # Use (?i) prefix for case-insensitive matching in yq
    yq -r ".agents | to_entries[] | select(.value.character | test(\"(?i)$query\")) | .key" "$theme_file" | head -1
}

echo "=== Character Lookup Tests ==="

PASS=0
FAIL=0

assert_eq() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$actual" == "$expected" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected '$expected', got '$actual'"
        ((FAIL++))
    fi
}

# Test 1: Exact match (lowercase)
result=$(find_character_in_theme "$THEME_FILE" "prospero")
assert_eq "sm" "$result" "Exact match lowercase"

# Test 2: Exact match (mixed case)
result=$(find_character_in_theme "$THEME_FILE" "Prospero")
assert_eq "sm" "$result" "Mixed case match"

# Test 3: Exact match (uppercase)
result=$(find_character_in_theme "$THEME_FILE" "PROSPERO")
assert_eq "sm" "$result" "Uppercase match"

# Test 4: Partial match - first name only
result=$(find_character_in_theme "$THEME_FILE" "puck")
assert_eq "dev" "$result" "Partial match (first name)"

# Test 5: Partial match - parenthetical name
result=$(find_character_in_theme "$THEME_FILE" "robin")
assert_eq "dev" "$result" "Parenthetical name match"

# Test 6: Match with title/suffix
result=$(find_character_in_theme "$THEME_FILE" "oberon")
assert_eq "architect" "$result" "Name with title match"

# Test 7: No match - returns empty
result=$(find_character_in_theme "$THEME_FILE" "hamlet-not-exist")
assert_eq "" "$result" "No match returns empty"

# Test 8: Hamlet match (partial)
result=$(find_character_in_theme "$THEME_FILE" "hamlet")
assert_eq "tea" "$result" "Hamlet partial match"

# Test 9: Portia match
result=$(find_character_in_theme "$THEME_FILE" "portia")
assert_eq "reviewer" "$result" "Portia match"

# Test 10: King match (partial in title)
result=$(find_character_in_theme "$THEME_FILE" "king")
assert_eq "architect" "$result" "King partial match in title"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi

echo "=== All Character Lookup Tests PASSED ==="
