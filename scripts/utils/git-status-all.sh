#!/bin/bash
# Show git status across all repos
# Usage: ./scripts/git-status-all.sh [--brief]
#
# Shows: branch, status, unpushed commits for all repos

set -e

# Source environment (inline to avoid argument passing issues)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
    set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# Fallback if PROJECT_ROOT not set
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

BRIEF=false
if [ "$1" = "--brief" ] || [ "$1" = "-b" ]; then
    BRIEF=true
fi

cd "$PROJECT_ROOT"

show_repo_status() {
    local name=$1
    local path=$2

    if [ ! -d "$path/.git" ] && [ ! -d "$path" ]; then
        return
    fi

    local branch=$(git -C "$path" branch --show-current 2>/dev/null || echo "detached")
    local status=$(git -C "$path" status --short 2>/dev/null)
    local status_count=$(echo "$status" | grep -c . 2>/dev/null); status_count=${status_count:-0}
    local unpushed=$(git -C "$path" log origin/develop..HEAD --oneline 2>/dev/null | head -5)
    local unpushed_count=$(git -C "$path" log origin/develop..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')

    if $BRIEF; then
        # One-line format
        local status_indicator=""
        [ "$status_count" -gt 0 ] && status_indicator="${YELLOW}M${NC}" || status_indicator="${GREEN}✓${NC}"
        local push_indicator=""
        [ "$unpushed_count" -gt 0 ] && push_indicator=" ${BLUE}↑${unpushed_count}${NC}"
        echo -e "$name: $branch $status_indicator$push_indicator"
    else
        echo -e "${BLUE}=== $name ===${NC}"
        echo -e "Branch: ${GREEN}$branch${NC}"

        if [ -n "$status" ]; then
            echo -e "${YELLOW}Changes:${NC}"
            echo "$status" | head -10 | sed 's/^/  /'
            [ "$status_count" -gt 10 ] && echo "  ... and $((status_count - 10)) more"
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

# Check each repo
show_repo_status "Parent" "$PROJECT_ROOT"
show_repo_status "API" "$PROJECT_ROOT/conductor-api"
show_repo_status "UI" "$PROJECT_ROOT/conductor-ui"

if ! $BRIEF; then
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Summary
    total_changes=0
    total_unpushed=0
    for repo in "$PROJECT_ROOT" "$PROJECT_ROOT/conductor-api" "$PROJECT_ROOT/conductor-ui"; do
        [ -d "$repo/.git" ] || [ -d "$repo" ] || continue
        count=$(git -C "$repo" status --short 2>/dev/null | wc -l | tr -d ' ')
        total_changes=$((total_changes + count))
        unpushed=$(git -C "$repo" log origin/develop..HEAD --oneline 2>/dev/null | wc -l | tr -d ' ')
        total_unpushed=$((total_unpushed + unpushed))
    done

    if [ "$total_changes" -eq 0 ] && [ "$total_unpushed" -eq 0 ]; then
        echo -e "${GREEN}✅ All repos clean and pushed${NC}"
    else
        [ "$total_changes" -gt 0 ] && echo -e "${YELLOW}$total_changes uncommitted change(s)${NC}"
        [ "$total_unpushed" -gt 0 ] && echo -e "${BLUE}$total_unpushed unpushed commit(s)${NC}"
    fi
fi
