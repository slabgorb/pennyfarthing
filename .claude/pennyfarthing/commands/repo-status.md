---
description: Check git status of all project repos
---

# Repository Status Check

Check the git status of all project repos at once.

## Prerequisites

Environment variables (set in `.claude/project/hooks/setup-env.sh`):
- `PROJECT_NAME` - Name of the project
- `API_REPO` - Name of API repository
- `UI_REPO` - Name of UI repository

## Instructions

Run this command to show the status of all repos:

```bash
cd $CLAUDE_PROJECT_DIR

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              ${PROJECT_NAME:-PROJECT} REPO STATUS                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ ${PROJECT_NAME:-PROJECT} (parent)                                        │"
echo "└─────────────────────────────────────────────────────────────┘"
git status --short --branch
git log --oneline -1
echo ""

if [ -d "API" ]; then
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ ${API_REPO:-API}                                                       │"
echo "└─────────────────────────────────────────────────────────────┘"
cd API
git status --short --branch
git log --oneline -1
cd ..
echo ""
fi

if [ -d "UI" ]; then
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│ ${UI_REPO:-UI}                                                        │"
echo "└─────────────────────────────────────────────────────────────┘"
cd UI
git status --short --branch
git log --oneline -1
cd ..
echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
```

Report the results clearly showing:
- Current branch for each repo
- Whether there are uncommitted changes
- Whether the repo is ahead/behind origin
- Most recent commit
