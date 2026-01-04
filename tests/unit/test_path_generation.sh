#!/bin/bash
# test_path_generation.sh - Tests for cross-role output path construction

# Don't exit on error for test script - we handle failures ourselves

echo "=== Output Path Generation Tests ==="

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

# Generate character slug - matches solo-runner.sh logic
slugify() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

# Generate path - matches solo-runner.sh logic
generate_path() {
    local theme="$1"
    local character="$2"
    local effective_role="$3"
    local cross_role="$4"

    if [[ "$cross_role" == "true" ]]; then
        local character_slug=$(slugify "$character")
        echo "${theme}-${character_slug}-as-${effective_role}"
    else
        echo "${theme}-${effective_role}"
    fi
}

# Test 1: Standard mode (no cross-role)
result=$(generate_path "shakespeare" "Puck" "dev" "false")
assert_eq "shakespeare-dev" "$result" "Standard mode: shakespeare:dev"

# Test 2: Cross-role: simple character name
result=$(generate_path "shakespeare" "Prospero" "dev" "true")
assert_eq "shakespeare-prospero-as-dev" "$result" "Cross-role: simple name"

# Test 3: Cross-role: character with parentheses
result=$(generate_path "shakespeare" "Puck (Robin Goodfellow)" "reviewer" "true")
assert_eq "shakespeare-puck-robin-goodfellow-as-reviewer" "$result" "Cross-role: parentheses"

# Test 4: Cross-role: character with comma and title
result=$(generate_path "shakespeare" "Oberon, King of the Fairies" "dev" "true")
assert_eq "shakespeare-oberon-king-of-the-fairies-as-dev" "$result" "Cross-role: comma and title"

# Test 5: Cross-role: Discworld character
result=$(generate_path "discworld" "Granny Weatherwax" "dev" "true")
assert_eq "discworld-granny-weatherwax-as-dev" "$result" "Cross-role: Granny Weatherwax"

# Test 6: Cross-role: ALL CAPS character
result=$(generate_path "shakespeare" "PROSPERO" "tea" "true")
assert_eq "shakespeare-prospero-as-tea" "$result" "Cross-role: all caps"

# Test 7: Standard mode with different theme
result=$(generate_path "discworld" "Death" "sm" "false")
assert_eq "discworld-sm" "$result" "Standard mode: discworld:sm"

# Test 8: Cross-role: character with numbers (edge case)
result=$(generate_path "test" "R2D2" "dev" "true")
assert_eq "test-r2d2-as-dev" "$result" "Cross-role: alphanumeric"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
    exit 1
fi

echo "=== All Path Generation Tests PASSED ==="
