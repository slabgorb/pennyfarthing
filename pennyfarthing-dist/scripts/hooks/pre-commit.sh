#!/bin/bash
# pre-commit.sh - Git hook to enforce branch protection
#
# Prevents direct commits to protected branches (main, develop).
# Exception: sprint/ folder commits allowed on develop for administrative tracking.
#
# Installation:
#   Installed to .git/hooks/pre-commit by pennyfarthing init or doctor --fix
#   Or symlink: ln -sf ../../pennyfarthing-dist/scripts/hooks/pre-commit.sh .git/hooks/pre-commit

set -uo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
PROTECTED_BRANCHES="^(main|develop)$"

if [[ $BRANCH =~ $PROTECTED_BRANCHES ]]; then
    # Special case: Allow sprint/ folder commits on develop branch
    if [[ $BRANCH == "develop" ]]; then
        STAGED_FILES=$(git diff --cached --name-only)
        NON_SPRINT_FILES=$(echo "$STAGED_FILES" | grep -v "^sprint/")

        # If all staged files are in sprint/, allow the commit
        if [ -z "$NON_SPRINT_FILES" ] && [ -n "$STAGED_FILES" ]; then
            exit 0
        fi
    fi

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

exit 0
