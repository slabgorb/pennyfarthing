#!/usr/bin/env zsh
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Loads context in priority order (CLAUDE.md skipped - already in system prompt):
# 1. Sprint summary (current-sprint.yaml key fields)
# 2. Active session (.session/*-session.md)
# 3. Agent sidecar (if --agent provided)
# 4. Agent behavior guide (combined protocols for all agents)
# 5. Domain docs (--full only)

set -euo pipefail

# Find project root and load shared functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/find-root.sh"
source "$SCRIPT_DIR/../sprint/sprint-common.sh"

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
            echo "  --minimal      Skip all context (fastest)"
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

# CLAUDE.md is already loaded by Claude Code system prompt - skip it

# Stop here for minimal mode
if [[ "$MINIMAL" == "true" ]]; then
    exit 0
fi

# 1. Sprint summary (uses shared functions from sprint-common.sh)
if [[ -f "$(get_sprint_file)" ]]; then
    print_header "Sprint Context"

    # Use shared functions for consistent output
    summary=$(get_sprint_summary)
    if [[ -n "$summary" ]]; then
        echo "$summary"
    fi

    progress=$(get_sprint_progress)
    if [[ -n "$progress" ]]; then
        echo "$progress"
    fi
fi

# 2. Active session (if exists) - extract header metadata + current assessment
SESSION_FILE=""
if [[ -d "$PROJECT_ROOT/.session" ]]; then
    # Find a session file (typically only one active at a time)
    SESSION_FILE=$(find "$PROJECT_ROOT/.session" -maxdepth 1 -name "*-session.md" -type f 2>/dev/null | head -1)
fi

if [[ -n "$SESSION_FILE" && -f "$SESSION_FILE" ]]; then
    print_header "Active Session: $(basename "$SESSION_FILE")"

    # Extract header (everything before first ## heading)
    # This includes: title, metadata fields (Phase, Workflow, Repos, Branch, etc.)
    awk '/^## / {exit} {print}' "$SESSION_FILE"

    # Find the most recent assessment section (workflow-agnostic)
    # Assessment sections are named: "## {Agent} Assessment" (TEA, Dev, Reviewer, SM, etc.)
    # Show the LAST one in the file as it represents current state
    last_assessment=$(grep -n '^## .*Assessment' "$SESSION_FILE" | tail -1 | cut -d: -f1)

    if [[ -n "$last_assessment" ]]; then
        echo ""
        echo "---"
        # Extract from that line to next ## or EOF
        awk -v start="$last_assessment" '
            NR >= start {
                if (NR > start && /^## /) exit
                print
            }
        ' "$SESSION_FILE"
    fi
fi

# 3. Agent sidecar (if --agent provided)
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

# 4. Agent behavior guide (combined protocols for all agents)
if [[ -n "$AGENT_NAME" ]]; then
    BEHAVIOR_GUIDE="$PROJECT_ROOT/.pennyfarthing/guides/agent-behavior.md"
    if [[ -f "$BEHAVIOR_GUIDE" ]]; then
        print_header "Agent Behavior Guide"
        cat "$BEHAVIOR_GUIDE"
    fi
fi

# 5. Domain docs (--full only)
if [[ "$FULL" == "true" ]]; then
    for doc in "$PROJECT_ROOT/.claude/project"/CLAUDE-*.md; do
        if [[ -f "$doc" ]]; then
            print_header "$(basename "$doc")"
            cat "$doc"
        fi
    done
fi
