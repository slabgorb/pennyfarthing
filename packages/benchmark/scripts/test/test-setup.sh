#!/usr/bin/env zsh
# Pennyfarthing Test Setup Utilities
# Config-driven test utilities that work with any project structure
#
# Usage: source scripts/test/test-setup.sh
#
# Configuration is read from .pennyfarthing/repos.yaml
# See repos.yaml for schema documentation
#
# Functions:
#   generate_run_id             - Create timestamp-based unique run ID
#   get_log_path TYPE RUN_ID    - Return log file path for a test type
#   ensure_test_containers      - Start test containers if configured
#   setup_repo_test_env REPO    - Export test env vars for a repo
#   check_skip_violations REPO  - Check for forbidden skip patterns
#   show_skip_violations REPO   - Display skip violation details
#   cleanup_test_logs           - Remove old test/lint log files

# Don't exit on error - we want to handle errors gracefully
set +e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"

# Source repo-utils for config access
source "$CLAUDE_PROJECT_DIR/scripts/repo-utils.sh" 2>/dev/null || {
    echo "Warning: repo-utils.sh not found, using defaults" >&2
}

# ============================================================================
# Run ID and Logging
# ============================================================================

# Generate a unique run ID based on timestamp
# Usage: RUN_ID=$(generate_run_id)
generate_run_id() {
    date +%Y%m%d-%H%M%S
}

# Get log file path for a given type
# Usage: LOG_PATH=$(get_log_path "test-myrepo" "$RUN_ID")
# Types: test-{repo}, lint-{repo}, or any custom prefix
get_log_path() {
    local log_type="$1"
    local run_id="${2:-$(generate_run_id)}"

    # Use configured log dir or default
    local log_dir
    if declare -f get_test_log_dir &>/dev/null; then
        log_dir=$(get_test_log_dir)
    else
        log_dir="$CLAUDE_PROJECT_DIR/.session"
    fi

    echo "${log_dir}/${log_type}-results-${run_id}.log"
}

# ============================================================================
# Container Management
# ============================================================================

# Check if test containers are running, start if configured
# Returns: 0 if containers ready (or none needed), 1 if failed to start
ensure_test_containers() {
    # Get container command from config
    local container_cmd
    if declare -f get_container_command &>/dev/null; then
        container_cmd=$(get_container_command)
    fi

    # If no container command configured, nothing to do
    if [[ -z "$container_cmd" ]]; then
        return 0
    fi

    echo "Starting test containers via: $container_cmd"
    eval "$container_cmd"
    return $?
}

# ============================================================================
# Environment Setup
# ============================================================================

# Export test environment variables for a specific repo
# Usage: setup_repo_test_env "Pennyfarthing-api"
setup_repo_test_env() {
    local repo="$1"

    if declare -f get_test_env &>/dev/null; then
        local env_exports
        env_exports=$(get_test_env "$repo")
        if [[ -n "$env_exports" ]]; then
            eval "$env_exports"
        fi
    fi
}

# Export test environment for all repos
# Usage: setup_all_test_env
setup_all_test_env() {
    if ! declare -f get_repos &>/dev/null; then
        return 0
    fi

    for repo in $(get_repos); do
        setup_repo_test_env "$repo"
    done
}

# ============================================================================
# Skip Violation Checks
# ============================================================================

# Check for forbidden skip patterns in a repo's test files
# Usage: VIOLATIONS=$(check_skip_violations "Pennyfarthing-api")
# Returns: count of violations found
check_skip_violations() {
    local repo="$1"
    local count=0

    # Get repo info
    local repo_path language
    if declare -f get_repo_full_path &>/dev/null; then
        repo_path=$(get_repo_full_path "$repo")
        language=$(get_repo_language "$repo")
    else
        repo_path="$CLAUDE_PROJECT_DIR/$repo"
        language="unknown"
    fi

    if [[ ! -d "$repo_path" ]]; then
        echo "0"
        return 0
    fi

    # Get patterns for this language
    local skip_patterns skip_exceptions file_pattern
    if declare -f get_skip_patterns &>/dev/null; then
        skip_patterns=$(get_skip_patterns "$language")
        skip_exceptions=$(get_skip_exceptions "$language")
        file_pattern=$(get_test_file_pattern "$language")
    else
        # Fallback defaults
        case "$language" in
            go)
                skip_patterns='t\.Skip'
                skip_exceptions='LocalStack|not available'
                file_pattern='*_test.go'
                ;;
            typescript|javascript)
                skip_patterns='it\.skip|describe\.skip|test\.skip'
                skip_exceptions=''
                file_pattern='*.test.*'
                ;;
            *)
                echo "0"
                return 0
                ;;
        esac
    fi

    if [[ -z "$skip_patterns" ]]; then
        echo "0"
        return 0
    fi

    # Search for violations
    local grep_result
    grep_result=$(grep -r -E "$skip_patterns" "$repo_path" --include="$file_pattern" 2>/dev/null || true)

    # Filter out exceptions
    if [[ -n "$skip_exceptions" && -n "$grep_result" ]]; then
        grep_result=$(echo "$grep_result" | grep -v -E "$skip_exceptions" || true)
    fi

    # Count remaining violations
    if [[ -n "$grep_result" ]]; then
        count=$(echo "$grep_result" | wc -l | tr -d ' ')
    fi

    echo "$count"
}

# Show skip violations with file locations
# Usage: show_skip_violations "Pennyfarthing-api" [max_lines]
show_skip_violations() {
    local repo="$1"
    local max_lines="${2:-10}"

    # Get repo info
    local repo_path language
    if declare -f get_repo_full_path &>/dev/null; then
        repo_path=$(get_repo_full_path "$repo")
        language=$(get_repo_language "$repo")
    else
        repo_path="$CLAUDE_PROJECT_DIR/$repo"
        language="unknown"
    fi

    if [[ ! -d "$repo_path" ]]; then
        return 0
    fi

    # Get patterns for this language
    local skip_patterns skip_exceptions file_pattern
    if declare -f get_skip_patterns &>/dev/null; then
        skip_patterns=$(get_skip_patterns "$language")
        skip_exceptions=$(get_skip_exceptions "$language")
        file_pattern=$(get_test_file_pattern "$language")
    else
        return 0
    fi

    if [[ -z "$skip_patterns" ]]; then
        return 0
    fi

    # Search and display
    local grep_result
    grep_result=$(grep -r -E "$skip_patterns" "$repo_path" --include="$file_pattern" 2>/dev/null || true)

    if [[ -n "$skip_exceptions" && -n "$grep_result" ]]; then
        grep_result=$(echo "$grep_result" | grep -v -E "$skip_exceptions" || true)
    fi

    if [[ -n "$grep_result" ]]; then
        echo "$grep_result" | head -"$max_lines"
    fi
}

# Check all repos for skip violations
# Usage: TOTAL=$(check_all_skip_violations)
check_all_skip_violations() {
    local total=0

    if ! declare -f get_repos &>/dev/null; then
        echo "0"
        return 0
    fi

    for repo in $(get_repos); do
        local count
        count=$(check_skip_violations "$repo")
        total=$((total + count))
    done

    echo "$total"
}

# ============================================================================
# Cleanup
# ============================================================================

# Remove old test and lint log files
cleanup_test_logs() {
    local log_dir
    if declare -f get_test_log_dir &>/dev/null; then
        log_dir=$(get_test_log_dir)
    else
        log_dir="$CLAUDE_PROJECT_DIR/.session"
    fi

    rm -f "$log_dir"/test-*-results-*.log 2>/dev/null
    rm -f "$log_dir"/lint-*-results-*.log 2>/dev/null
}

# ============================================================================
# High-Level Test Running
# ============================================================================

# Run tests for a specific repo with logging
# Usage: run_repo_tests "Pennyfarthing-api" "$RUN_ID"
run_repo_tests() {
    local repo="$1"
    local run_id="${2:-$(generate_run_id)}"

    local repo_path test_cmd log_path
    if declare -f get_repo_full_path &>/dev/null; then
        repo_path=$(get_repo_full_path "$repo")
        test_cmd=$(get_test_command "$repo")
    else
        repo_path="$CLAUDE_PROJECT_DIR/$repo"
        test_cmd=""
    fi

    if [[ -z "$test_cmd" ]]; then
        echo "SKIP: $repo (no test command configured)"
        return 0
    fi

    if [[ ! -d "$repo_path" ]]; then
        echo "SKIP: $repo (path not found: $repo_path)"
        return 0
    fi

    log_path=$(get_log_path "test-$repo" "$run_id")

    # Setup environment for this repo
    setup_repo_test_env "$repo"

    echo "=== Testing $repo ==="
    (cd "$repo_path" && eval "$test_cmd") 2>&1 | tee "$log_path"
    local exit_code=${pipestatus[1]}

    if [[ $exit_code -eq 0 ]]; then
        echo "PASS: $repo"
    else
        echo "FAIL: $repo (exit code: $exit_code)"
    fi

    return $exit_code
}

# Run tests for all repos
# Usage: run_all_repo_tests "$RUN_ID"
run_all_repo_tests() {
    local run_id="${1:-$(generate_run_id)}"
    local failed=0

    ensure_test_containers || {
        echo "Warning: Container setup failed, continuing anyway"
    }

    if ! declare -f get_repos &>/dev/null; then
        echo "Warning: repo-utils not loaded, cannot iterate repos"
        return 1
    fi

    for repo in $(get_build_order); do
        if ! run_repo_tests "$repo" "$run_id"; then
            ((failed++)) || true
        fi
    done

    return $failed
}
