#!/bin/bash
# pre-commit.sh - Git hook to enforce branch protection and agent validation
#
# Checks:
# 1. Prevents direct commits to protected branches (main, develop)
#    Exceptions on develop: sprint/ files, version bump files (release scripts)
# 2. Validates agent files when pennyfarthing-dist/agents/*.md is modified
#
# Installation:
#   Installed to .git/hooks/pre-commit by pennyfarthing init or doctor --fix
#   Or symlink: ln -sf ../../pennyfarthing-dist/scripts/hooks/pre-commit.sh .git/hooks/pre-commit

set -uo pipefail

# Find project root (resolve symlink first for .git/hooks/ symlinks)
REAL_SCRIPT="$(readlink -f "${BASH_SOURCE[0]:-$0}" 2>/dev/null || realpath "${BASH_SOURCE[0]:-$0}" 2>/dev/null || echo "${BASH_SOURCE[0]:-$0}")"
source "$(dirname "$REAL_SCRIPT")/../lib/find-root.sh"

# =============================================================================
# Check 1: Branch Protection
# =============================================================================

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
PROTECTED_BRANCHES="^(main|develop)$"

if [[ $BRANCH =~ $PROTECTED_BRANCHES ]]; then
    # Special case: Allow sprint/ folder commits on develop branch
    # Special case: Allow version bump commits from release/deploy scripts
    if [[ $BRANCH == "develop" ]]; then
        STAGED_FILES=$(git diff --cached --name-only)
        NON_SPRINT_FILES=$(echo "$STAGED_FILES" | grep -v "^sprint/")

        # Check if this is a version bump commit (only VERSION + package.json files)
        NON_VERSION_FILES=$(echo "$STAGED_FILES" | grep -v -E "^(VERSION|package\.json|package-lock\.json|pnpm-lock\.yaml|packages/.*/package\.json|CHANGELOG\.md|README\.md)$")

        # If all staged files are in sprint/, allow the commit
        if [ -z "$NON_SPRINT_FILES" ] && [ -n "$STAGED_FILES" ]; then
            # Continue to agent validation check
            :
        # If all staged files are version/release files, allow the commit
        elif [ -z "$NON_VERSION_FILES" ] && [ -n "$STAGED_FILES" ]; then
            # Continue to agent validation check
            :
        else
            echo ""
            echo "COMMIT BLOCKED"
            echo ""
            echo "You are trying to commit directly to: $BRANCH"
            echo "This violates the git workflow rules."
            echo ""
            echo "Protected branches: main, develop"
            echo ""
            echo "What to do:"
            echo "1. Create a feature branch:"
            echo "   git checkout -b <type>/<epic-story>-<description>"
            echo ""
            echo "2. Example:"
            echo "   git checkout -b feat/8-2-add-authentication"
            echo ""
            echo "3. Then commit your changes on the feature branch"
            echo ""
            echo "Exception: Sprint tracking files (sprint/*) can be committed to develop"
            echo ""
            exit 1
        fi
    else
        echo ""
        echo "COMMIT BLOCKED - Cannot commit directly to $BRANCH"
        echo ""
        exit 1
    fi
fi

# =============================================================================
# Check 2: Agent File Validation
# =============================================================================

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
AGENT_FILES=$(echo "$STAGED_FILES" | grep "^pennyfarthing-dist/agents/.*\.md$" || true)

if [[ -n "$AGENT_FILES" ]]; then
    echo "Agent files staged for commit:"
    echo "$AGENT_FILES" | sed 's/^/  /'
    echo ""

    VALIDATOR="$PROJECT_ROOT/pennyfarthing-dist/scripts/validation/validate-agent-schema.sh"

    if [[ -x "$VALIDATOR" ]]; then
        echo "Running agent schema validation..."
        echo ""

        if ! "$VALIDATOR"; then
            echo ""
            echo "COMMIT BLOCKED - Agent validation failed"
            echo ""
            echo "Fix the validation errors above and try again."
            echo "Run 'just validate-agents -v' for detailed output."
            echo ""
            exit 1
        fi

        echo ""
        echo "✓ Agent validation passed"
    else
        echo "Warning: Agent validator not found at $VALIDATOR"
        echo "Skipping agent validation."
    fi
fi

exit 0
