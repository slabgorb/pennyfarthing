#!/usr/bin/env bash
# test-cache.sh - Read/write test result cache in session files
#
# Usage:
#   source test-cache.sh
#
#   # Check if valid cache exists (returns 0 if valid, 1 if stale/missing)
#   if test_cache_valid "$SESSION_FILE"; then
#       RESULT=$(test_cache_get "$SESSION_FILE" "result")
#       echo "Using cached result: $RESULT"
#   fi
#
#   # Write cache after running tests
#   test_cache_write "$SESSION_FILE" "GREEN" 42 0 1 "12s"

set -euo pipefail

# Cache validity window (5 minutes)
CACHE_MAX_AGE_MINUTES=5

# Check if test cache exists and is valid (same SHA, < 5 min old)
# Returns: 0 if valid, 1 if invalid/missing
test_cache_valid() {
    local session_file="$1"

    if [[ ! -f "$session_file" ]]; then
        return 1
    fi

    if ! grep -q "^## Test Cache" "$session_file" 2>/dev/null; then
        return 1
    fi

    local current_sha
    current_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

    local cache_sha
    cache_sha=$(grep "| Git SHA |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs)

    if [[ "$cache_sha" != "$current_sha" ]]; then
        return 1
    fi

    local cache_time
    cache_time=$(grep "| Last Run |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs)

    local cache_epoch now_epoch age_minutes
    # macOS date
    cache_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$cache_time" +%s 2>/dev/null || \
                  date -d "$cache_time" +%s 2>/dev/null || echo 0)
    now_epoch=$(date +%s)
    age_minutes=$(( (now_epoch - cache_epoch) / 60 ))

    if [[ $age_minutes -ge $CACHE_MAX_AGE_MINUTES ]]; then
        return 1
    fi

    return 0
}

# Get a field from the test cache
# Usage: test_cache_get "$SESSION_FILE" "result|pass|fail|skip|duration|sha|time"
test_cache_get() {
    local session_file="$1"
    local field="$2"

    case "$field" in
        result)   grep "| Result |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        pass)     grep "| Pass |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        fail)     grep "| Fail |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        skip)     grep "| Skip |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        duration) grep "| Duration |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        sha)      grep "| Git SHA |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        time)     grep "| Last Run |" "$session_file" 2>/dev/null | sed 's/.*| \([^ ]*\) |.*/\1/' | xargs ;;
        *)        echo "Unknown field: $field" >&2; return 1 ;;
    esac
}

# Write test cache to session file
# Usage: test_cache_write "$SESSION_FILE" "GREEN" 42 0 1 "12s"
test_cache_write() {
    local session_file="$1"
    local result="$2"      # GREEN, RED, YELLOW
    local pass="$3"        # pass count
    local fail="$4"        # fail count
    local skip="$5"        # skip count
    local duration="$6"    # e.g., "12s"

    local git_sha timestamp
    git_sha=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local cache_section="## Test Cache

| Field | Value |
|-------|-------|
| Last Run | $timestamp |
| Git SHA | $git_sha |
| Result | $result |
| Pass | $pass |
| Fail | $fail |
| Skip | $skip |
| Duration | $duration |"

    if [[ ! -f "$session_file" ]]; then
        echo "Session file not found: $session_file" >&2
        return 1
    fi

    # Check if Test Cache section exists
    if grep -q "^## Test Cache" "$session_file" 2>/dev/null; then
        # Replace existing section - find start and end, replace content
        local temp_file
        temp_file=$(mktemp)

        awk -v new_section="$cache_section" '
            /^## Test Cache/ {
                in_section = 1
                print new_section
                next
            }
            /^## / && in_section {
                in_section = 0
            }
            !in_section { print }
        ' "$session_file" > "$temp_file"

        mv "$temp_file" "$session_file"
    else
        # Append before "## Workflow Tracking" if present, else at end
        if grep -q "^## Workflow Tracking" "$session_file" 2>/dev/null; then
            local temp_file
            temp_file=$(mktemp)

            awk -v new_section="$cache_section" '
                /^## Workflow Tracking/ {
                    print new_section
                    print ""
                }
                { print }
            ' "$session_file" > "$temp_file"

            mv "$temp_file" "$session_file"
        else
            echo "" >> "$session_file"
            echo "$cache_section" >> "$session_file"
        fi
    fi

    echo "Test cache written: $result ($pass passed, $fail failed, $skip skipped)"
}

# Print cache status for debugging
test_cache_status() {
    local session_file="$1"

    if test_cache_valid "$session_file"; then
        echo "Cache: VALID"
        echo "  Result: $(test_cache_get "$session_file" "result")"
        echo "  SHA: $(test_cache_get "$session_file" "sha")"
        echo "  Time: $(test_cache_get "$session_file" "time")"
    else
        echo "Cache: INVALID or MISSING"
    fi
}
