---
description: Create a new worktree for parallel development work
---

# Setup Worktree for Parallel Work

Creates an isolated worktree for working on a story/bug without affecting main checkout. Use this when you need to work on multiple things simultaneously.

## When to Use

- ✅ Story blocked waiting for review - start new work
- ✅ Urgent bug fix while mid-feature
- ✅ Reviewing PR while keeping feature work intact
- ✅ Running long tests in one worktree, coding in another

## Prerequisites

- [ ] Know what you're working on (story ID, bug number, etc.)
- [ ] Main checkout is on develop (recommended but not required)

## Steps

### 1. Determine Worktree Name and Branch

| Work Type | Worktree Name | Branch Name |
|-----------|---------------|-------------|
| Feature | `5-1a` | `feat/5-1a-description` |
| Bug Fix | `bug-123` | `fix/bug-123-description` |
| Chore | `chore-deps` | `chore/update-deps` |
| Review | `review-42` | (existing PR branch) |

### 2. Create the Worktree

```bash
cd $PROJECT_ROOT

# For a feature (both API and UI)
./scripts/worktree-manager.sh create <name> <branch>

# Example: Story 5-1a
./scripts/worktree-manager.sh create 5-1a feat/5-1a-file-upload

# For API-only work
./scripts/worktree-manager.sh create <name> <branch> api

# For UI-only work
./scripts/worktree-manager.sh create <name> <branch> ui
```

### 3. Verify Creation

```bash
cd $PROJECT_ROOT
./scripts/worktree-manager.sh status
```

### 4. Get Port Configuration

For running dev servers in the worktree:

```bash
# Get port assignments
eval $(./scripts/worktree-manager.sh ports <name>)
echo "API: $API_PORT, UI: $UI_PORT"
```

### 5. Start Working

```bash
# Navigate to worktree
cd $(./scripts/worktree-manager.sh cd <name>)

# Or directly
cd $PROJECT_ROOT/worktrees/<name>/API
cd $PROJECT_ROOT/worktrees/<name>/UI
```

### 6. Start Dev Servers (with custom ports)

```bash
# Terminal 1: API
eval $(./scripts/worktree-manager.sh ports <name>)
cd $WORKTREE_PATH/API
API_PORT=$API_PORT make dev

# Terminal 2: UI
eval $(./scripts/worktree-manager.sh ports <name>)
cd $WORKTREE_PATH/UI
VITE_PORT=$UI_PORT npm run dev
```

## Managing Worktrees

### List All Worktrees

```bash
./scripts/worktree-manager.sh list
```

### Check Status

```bash
./scripts/worktree-manager.sh status
```

### Remove Worktree (after merge)

```bash
./scripts/worktree-manager.sh remove <name>
```

## Example: Full Workflow

```bash
# 1. Create worktree for story 5-2
./scripts/worktree-manager.sh create 5-2 feat/5-2-csv-import

# 2. Work on the feature
cd worktrees/5-2/API
# ... make changes ...
git add . && git commit -m "feat(5-2): implement CSV parser"

cd ../UI
# ... make changes ...
git add . && git commit -m "feat(5-2): add import UI"

# 3. Push and create PR
cd worktrees/5-2/API
git push -u origin feat/5-2-csv-import
gh pr create --base develop

cd ../UI
git push -u origin feat/5-2-csv-import
gh pr create --base develop

# 4. After PR is merged, clean up
cd $PROJECT_ROOT
./scripts/worktree-manager.sh remove 5-2
```

## Tips

### Session Files

Each worktree gets its own session file at `.session/wt-<name>.md`. Edit this to track your work.

### Port Assignments

Ports are automatically offset based on worktree index:
- Main checkout: 8080 (API), 5173 (UI)
- Worktree 1: 8180, 5273
- Worktree 2: 8280, 5373
- etc.

### Switching Between Worktrees

```bash
# Quick navigation
cd $(./scripts/worktree-manager.sh cd 5-1a)
cd $(./scripts/worktree-manager.sh cd 5-2)
```

### Don't Forget to Clean Up

After merging, always remove the worktree:
```bash
./scripts/worktree-manager.sh remove <name>
```

## Troubleshooting

### "Branch already checked out"

A branch can only be checked out in one worktree at a time. Either:
1. Use a different branch name
2. Remove the existing worktree first

### "Worktree already exists"

```bash
# Check existing worktrees
./scripts/worktree-manager.sh list

# Remove if no longer needed
./scripts/worktree-manager.sh remove <name>
```

### Port Conflicts

If ports are in use, check what's running:
```bash
lsof -ti:8180  # Check API port
lsof -ti:5273  # Check UI port
```

---

**You're ready for parallel development!**
