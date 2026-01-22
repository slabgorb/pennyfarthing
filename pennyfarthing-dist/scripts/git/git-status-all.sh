#!/usr/bin/env zsh
# Show git status across all repos
# Usage: ./scripts/git-status-all.sh [--brief]
#
# Shows: branch, status, unpushed commits for all repos
# Reads repo configuration from .claude/project/repos.yaml

set -e

# Source environment (inline to avoid argument passing issues)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# Fallback if PROJECT_ROOT not set
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

# Source repo utilities for dynamic repo configuration
source "$SCRIPT_DIR/../repo-utils.sh"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

BRIEF=false
if [ "${1:-}" = "--brief" ] || [ "${1:-}" = "-b" ]; then
    BRIEF=true
fi

cd "$PROJECT_ROOT"

show_repo_status() {
    local repo_name=$1
    local repo_dir=$2  # Note: can't use 'path' - it's a zsh special variable

    if [ ! -d "$repo_dir/.git" ] && [ ! -d "$repo_dir" ]; then
        return
    fi

    local branch=$(git -C "$repo_dir" branch --show-current 2>/dev/null || echo "detached")
    local git_status=$(git -C "$repo_dir" status --short 2>/dev/null)
    local git_status_count=$(echo "$git_status" | grep -c . 2>/dev/null); git_status_count=${git_status_count:-0}
    local unpushed=$(git -C "$repo_dir" log origin/develop..HEAD --oneline 2>/dev/null | head -5)
    local unpushed_count=$(git -C "$repo_dir" log origin/develop..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')

    if $BRIEF; then
        # One-line format
        local status_indicator=""
        [ "$git_status_count" -gt 0 ] && status_indicator="${YELLOW}M${NC}" || status_indicator="${GREEN}✓${NC}"
        local push_indicator=""
        [ "$unpushed_count" -gt 0 ] && push_indicator=" ${BLUE}↑${unpushed_count}${NC}"
        echo -e "$repo_name: $branch $status_indicator$push_indicator"
    else
        echo -e "${BLUE}=== $repo_name ===${NC}"
        echo -e "Branch: ${GREEN}$branch${NC}"

        if [ -n "$git_status" ]; then
            echo -e "${YELLOW}Changes:${NC}"
            echo "$git_status" | head -10 | sed 's/^/  /'
            [ "$git_status_count" -gt 10 ] && echo "  ... and $((git_status_count - 10)) more"
        else
            echo -e "${GREEN}Clean${NC}"
        fi

        if [ "$unpushed_count" -gt 0 ]; then
            echo -e "${BLUE}Unpushed ($unpushed_count):${NC}"
            echo "$unpushed" | sed 's/^/  /'
            [ "$unpushed_count" -gt 5 ] && echo "  ... and $((unpushed_count - 5)) more"
        fi
        echo ""
    fi
}

if ! $BRIEF; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Git Status - All Repos${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
fi

# Check each repo from configuration
repo_count=$(get_repo_count)
if [[ "$repo_count" -eq 0 ]]; then
    # No repos configured, just show current directory
    show_repo_status "Project" "$PROJECT_ROOT"
else
    for repo in $(get_repos); do
        repo_path=$(get_repo_full_path "$repo")
        show_repo_status "$repo" "$repo_path"
    done
fi

if ! $BRIEF; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Summary
    total_changes=0
    total_unpushed=0

    if [[ "$repo_count" -eq 0 ]]; then
        # No repos configured, just check current directory
        count=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null | wc -l | tr -d ' ')
        total_changes=$((total_changes + count))
        unpushed=$(git -C "$PROJECT_ROOT" log origin/develop..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
        total_unpushed=$((total_unpushed + unpushed))
    else
        for repo in $(get_repos); do
            repo_path=$(get_repo_full_path "$repo")
            [ -d "$repo_path/.git" ] || [ -d "$repo_path" ] || continue
            count=$(git -C "$repo_path" status --short 2>/dev/null | wc -l | tr -d ' ')
            total_changes=$((total_changes + count))
            unpushed=$(git -C "$repo_path" log origin/develop..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
            total_unpushed=$((total_unpushed + unpushed))
        done
    fi

    if [ "$total_changes" -eq 0 ] && [ "$total_unpushed" -eq 0 ]; then
        echo -e "${GREEN}✅ All repos clean and pushed${NC}"
    else
        [ "$total_changes" -gt 0 ] && echo -e "${YELLOW}$total_changes uncommitted change(s)${NC}"
        [ "$total_unpushed" -gt 0 ] && echo -e "${BLUE}$total_unpushed unpushed commit(s)${NC}"
    fi
fi
