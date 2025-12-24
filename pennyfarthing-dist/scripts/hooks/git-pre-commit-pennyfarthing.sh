#!/bin/bash
# Git pre-commit hook: Prevent commits that modify pennyfarthing submodule
# Add this check to your project's .git/hooks/pre-commit
#
# Usage: Source this file from your pre-commit hook:
#   source .claude/pennyfarthing/scripts/hooks/git-pre-commit-pennyfarthing.sh

# Check for staged changes in pennyfarthing submodule
if git diff --cached --name-only | grep -q "^\.claude/pennyfarthing/"; then
    echo ""
    echo "❌ COMMIT BLOCKED!"
    echo ""
    echo "You are trying to commit changes to the pennyfarthing submodule."
    echo "Pennyfarthing should be edited in its own repository, not here."
    echo ""
    echo "What to do:"
    echo "  1. Unstage the pennyfarthing changes:"
    echo "     git restore --staged .claude/pennyfarthing"
    echo ""
    echo "  2. Discard local changes (revert to submodule state):"
    echo "     cd .claude/pennyfarthing && git checkout ."
    echo ""
    echo "  3. Or, if you need to modify pennyfarthing:"
    echo "     a. cd .claude/pennyfarthing"
    echo "     b. Create a branch and make changes"
    echo "     c. Commit and push to pennyfarthing repo"
    echo "     d. Update submodule reference: git add .claude/pennyfarthing"
    echo ""
    exit 1
fi

# Allow submodule reference updates (just the pointer, not content)
# This is detected as a single line change to .claude/pennyfarthing
