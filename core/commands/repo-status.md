---
description: Check git status of all Conductor repos
---

# Repository Status Check

Check the git status of all three Conductor repos at once.

## Instructions

Run this command to show the status of all repos:

```bash
cd $PROJECT_ROOT

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    CONDUCTOR REPO STATUS                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ CONDUCTOR (parent)                                          │"
echo "└─────────────────────────────────────────────────────────────┘"
git status --short --branch
git log --oneline -1
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ CONDUCTOR-API                                               │"
echo "└─────────────────────────────────────────────────────────────┘"
cd API
git status --short --branch
git log --oneline -1
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ CONDUCTOR-UI                                                │"
echo "└─────────────────────────────────────────────────────────────┘"
cd ../UI
git status --short --branch
git log --oneline -1
echo ""

echo "═══════════════════════════════════════════════════════════════"
```

Report the results clearly showing:
- Current branch for each repo
- Whether there are uncommitted changes
- Whether the repo is ahead/behind origin
- Most recent commit
