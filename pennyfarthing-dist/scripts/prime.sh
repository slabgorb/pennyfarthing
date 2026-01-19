#!/usr/bin/env zsh
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Loads context in priority order:
# 1. CLAUDE.md (project + user)
# 2. Sprint summary (current-sprint.yaml key fields)
# 3. Active session (.session/*-session.md)
# 4. Agent sidecar (if --agent provided)
# 5. Shared context (project info - all agents)
# 6. Shared agent behavior (protocols - all agents)
# 7. Tactical guide (for sm, tea, dev, reviewer)
# 8. Domain docs (--full only)

set -euo pipefail

# Find project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/utils/find-root.sh"

# Defaults
QUIET=false
MINIMAL=false
FULL=false
AGENT_NAME=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quiet) QUIET=true; shift ;;
        --minimal) MINIMAL=true; shift ;;
        --full) FULL=true; shift ;;
        --agent) AGENT_NAME="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]"
            echo "  --minimal      Load only CLAUDE.md files (fastest)"
            echo "  --full         Include domain docs from .claude/project/"
            echo "  --quiet        Suppress section headers"
            echo "  --agent <name> Load agent's sidecar patterns"
            exit 0
            ;;
        *) shift ;;
    esac
done

# Helper to print headers (respects --quiet)
print_header() {
    if [[ "$QUIET" != "true" ]]; then
        echo ""
        echo "# $1"
    fi
}

# 1. Project CLAUDE.md (always loaded first)
if [[ -f "$PROJECT_ROOT/CLAUDE.md" ]]; then
    print_header "CLAUDE.md"
    cat "$PROJECT_ROOT/CLAUDE.md"
fi

# 2. User CLAUDE.md (if exists)
if [[ -f "$HOME/.claude/CLAUDE.md" ]]; then
    print_header "~/.claude/CLAUDE.md"
    cat "$HOME/.claude/CLAUDE.md"
fi

# Stop here for minimal mode
if [[ "$MINIMAL" == "true" ]]; then
    exit 0
fi

# 3. Sprint summary (extract key info only, not full notes)
if [[ -f "$PROJECT_ROOT/sprint/current-sprint.yaml" ]]; then
    print_header "Sprint Context"

    # Extract sprint number and goal
    sprint_num=$(yq '.sprint.number // ""' "$PROJECT_ROOT/sprint/current-sprint.yaml" 2>/dev/null)
    sprint_goal=$(yq '.sprint.goal // ""' "$PROJECT_ROOT/sprint/current-sprint.yaml" 2>/dev/null)
    if [[ -n "$sprint_num" && "$sprint_num" != "null" ]]; then
        echo "Sprint ${sprint_num}: ${sprint_goal}"
    fi

    # Extract progress
    completed=$(yq '.summary.completed_points // 0' "$PROJECT_ROOT/sprint/current-sprint.yaml" 2>/dev/null)
    total=$(yq '.summary.total_points // 0' "$PROJECT_ROOT/sprint/current-sprint.yaml" 2>/dev/null)
    if [[ -n "$completed" && -n "$total" ]]; then
        echo "Progress: ${completed}/${total} points"
    fi
fi

# 4. Active session (if exists) - first 50 lines only
SESSION_FILE=""
if [[ -d "$PROJECT_ROOT/.session" ]]; then
    # Find a session file (typically only one active at a time)
    SESSION_FILE=$(find "$PROJECT_ROOT/.session" -maxdepth 1 -name "*-session.md" -type f 2>/dev/null | head -1)
fi

if [[ -n "$SESSION_FILE" && -f "$SESSION_FILE" ]]; then
    print_header "Active Session: $(basename "$SESSION_FILE")"
    head -50 "$SESSION_FILE"

    # Indicate if truncated
    total_lines=$(wc -l < "$SESSION_FILE" | tr -d ' ')
    if [[ "$total_lines" -gt 50 ]]; then
        echo ""
        echo "... (truncated, ${total_lines} total lines)"
    fi
fi

# 5. Agent sidecar (if --agent provided)
if [[ -n "$AGENT_NAME" ]]; then
    SIDECAR_DIR="$PROJECT_ROOT/.pennyfarthing/sidecars/${AGENT_NAME}"
    if [[ -d "$SIDECAR_DIR" ]]; then
        for pattern_file in "$SIDECAR_DIR"/*.md; do
            if [[ -f "$pattern_file" ]]; then
                print_header "Agent Sidecar: $(basename "$pattern_file")"
                cat "$pattern_file"
            fi
        done
    fi
fi

# 6. Shared context (project info - all agents get this)
if [[ -n "$AGENT_NAME" ]]; then
    SHARED_CONTEXT="$PROJECT_ROOT/.pennyfarthing/guides/shared-context.md"
    if [[ -f "$SHARED_CONTEXT" ]]; then
        print_header "Shared Context"
        cat "$SHARED_CONTEXT"
    fi
fi

# 7. Shared agent behavior (protocols - all agents get this)
if [[ -n "$AGENT_NAME" ]]; then
    SHARED_GUIDE="$PROJECT_ROOT/.pennyfarthing/guides/shared-agent-behavior.md"
    if [[ -f "$SHARED_GUIDE" ]]; then
        print_header "Shared Agent Behavior"
        cat "$SHARED_GUIDE"
    fi
fi

# 8. Tactical guide (for tactical agents: sm, tea, dev, reviewer)
if [[ -n "$AGENT_NAME" ]]; then
    case "$AGENT_NAME" in
        sm|tea|dev|reviewer)
            TACTICAL_GUIDE="$PROJECT_ROOT/.pennyfarthing/guides/tactical-agent-behavior.md"
            if [[ -f "$TACTICAL_GUIDE" ]]; then
                print_header "Tactical Agent Behavior"
                cat "$TACTICAL_GUIDE"
            fi
            ;;
    esac
fi

# 9. Domain docs (--full only)
if [[ "$FULL" == "true" ]]; then
    for doc in "$PROJECT_ROOT/.claude/project"/CLAUDE-*.md; do
        if [[ -f "$doc" ]]; then
            print_header "$(basename "$doc")"
            cat "$doc"
        fi
    done
fi
