#!/usr/bin/env zsh
# prime.sh - Load essential project context at agent activation
# Usage: prime.sh [--minimal] [--full] [--quiet] [--agent <name>]
#
# Loads context in priority order (optimized for attention):
# 1. CLAUDE.md (already in system prompt - skipped)
# 2. Agent definition + behavior guide (HIGHEST PRIORITY - load first!)
# 3. Persona (already output by agent-session.sh before this runs)
# 4. Session summary (active work context)
# 5. Sidecars (patterns, gotchas, decisions - lowest priority)
# 6. Domain docs (--full only)

set -euo pipefail

# Load shared functions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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
            echo "  --agent <name> Load agent definition and sidecar"
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

# Stop here for minimal mode
if [[ "$MINIMAL" == "true" ]]; then
    exit 0
fi

# =============================================================================
# PRIORITY 1: Agent definition (HIGHEST ATTENTION ZONE)
# =============================================================================
# This is the most critical content - load it FIRST while attention is highest

if [[ -n "$AGENT_NAME" ]]; then
    AGENT_FILE="$PROJECT_ROOT/.pennyfarthing/agents/${AGENT_NAME}.md"
    if [[ -f "$AGENT_FILE" ]]; then
        print_header "Agent Definition: ${AGENT_NAME}"
        cat "$AGENT_FILE"
    fi
fi

# =============================================================================
# PRIORITY 2: Agent behavior guide (shared protocols)
# =============================================================================

if [[ -n "$AGENT_NAME" ]]; then
    BEHAVIOR_GUIDE="$PROJECT_ROOT/.pennyfarthing/guides/agent-behavior.md"
    if [[ -f "$BEHAVIOR_GUIDE" ]]; then
        print_header "Agent Behavior Guide"
        cat "$BEHAVIOR_GUIDE"
    fi
fi

# =============================================================================
# PRIORITY 3: Persona already loaded by agent-session.sh (before prime.sh runs)
# =============================================================================
# Nothing to do here - persona is output by agent-session.sh start

# =============================================================================
# PRIORITY 4: Session summary (active work context)
# =============================================================================

# Sprint summary (brief - just name and progress)
if [[ -f "$(get_sprint_file)" ]]; then
    print_header "Sprint Context"
    summary=$(get_sprint_summary)
    if [[ -n "$summary" ]]; then
        echo "$summary"
    fi
    progress=$(get_sprint_progress)
    if [[ -n "$progress" ]]; then
        echo "$progress"
    fi
fi

# Active session (if exists) - extract header metadata + current assessment
SESSION_FILE=""
if [[ -d "$PROJECT_ROOT/.session" ]]; then
    SESSION_FILE=$(find "$PROJECT_ROOT/.session" -maxdepth 1 -name "*-session.md" -type f 2>/dev/null | head -1)
fi

if [[ -n "$SESSION_FILE" && -f "$SESSION_FILE" ]]; then
    print_header "Active Session: $(basename "$SESSION_FILE")"

    # Extract header (everything before first ## heading)
    awk '/^## / {exit} {print}' "$SESSION_FILE"

    # Find the most recent assessment section
    last_assessment=$(grep -n '^## .*Assessment' "$SESSION_FILE" | tail -1 | cut -d: -f1)

    if [[ -n "$last_assessment" ]]; then
        echo ""
        echo "---"
        awk -v start="$last_assessment" '
            NR >= start {
                if (NR > start && /^## /) exit
                print
            }
        ' "$SESSION_FILE"
    fi
fi

# =============================================================================
# PRIORITY 5: Sidecars (patterns, gotchas, decisions - LOWEST PRIORITY)
# =============================================================================
# These are supplementary - loaded last when attention is lower

if [[ -n "$AGENT_NAME" ]]; then
    SIDECAR_DIR="$PROJECT_ROOT/.pennyfarthing/sidecars/${AGENT_NAME}"
    if [[ -d "$SIDECAR_DIR" ]]; then
        # Load in specific order: patterns first (most useful), then gotchas, then decisions
        for filename in patterns.md gotchas.md decisions.md; do
            pattern_file="$SIDECAR_DIR/$filename"
            if [[ -f "$pattern_file" ]]; then
                print_header "Agent Sidecar: $filename"
                cat "$pattern_file"
            fi
        done
    fi
fi

# =============================================================================
# PRIORITY 6: Domain docs (--full only, rarely used)
# =============================================================================

if [[ "$FULL" == "true" ]]; then
    for doc in "$PROJECT_ROOT/.claude/project"/CLAUDE-*.md; do
        if [[ -f "$doc" ]]; then
            print_header "$(basename "$doc")"
            cat "$doc"
        fi
    done
fi
