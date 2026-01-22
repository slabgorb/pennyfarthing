---
description: Create feature branches in both repos from a story
---

# Create Branches from Story Workflow

This workflow helps you create coordinated feature branches in the subrepos (`API`, `UI`) from a story or feature request.

## Prerequisites

- [ ] Story/feature is defined
- [ ] You're on the main branch in both repos
- [ ] Working directory is clean (no uncommitted changes)

## Steps

### 1. Extract Branch Name from Story

Read the story/feature description and create a branch name following the pattern:
- Format: `feature/[story-id]-[short-description]`
- Example: `feature/AUTH-123-user-login`
- Use kebab-case for description
- Keep it short but descriptive

**Branch naming conventions:**
- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `refactor/` - Code refactoring
- `chore/` - Maintenance tasks

### 2. Determine Scope

Ask: Does this story require changes in:
- [ ] API only → Create branch in `API` only
- [ ] UI only → Create branch in `UI` only
- [ ] Both → Create branches in both repos

### 2b. Choose Branch Strategy

**Option A: Standard (in-place branch switching)**
- Use when: Working on one thing at a time
- Pros: Simple, no extra directories
- Cons: Must stash/commit before switching

**Option B: Worktree (parallel development)**
- Use when: Need to work on multiple things simultaneously
- Pros: No branch switching, isolated work directories
- Cons: Uses more disk space

If you need parallel work, skip to **Step 3b** below.

### 3. Create Branches

Run the following commands based on scope:

#### For API Changes

```bash
cd $CLAUDE_PROJECT_DIR/API

# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create and checkout new branch
git checkout -b feature/[story-id]-[description]

# Push branch to remote
git push -u origin feature/[story-id]-[description]

# Confirm
git branch --show-current
```

#### For UI Changes

```bash
cd $CLAUDE_PROJECT_DIR/UI

# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create and checkout new branch
git checkout -b feature/[story-id]-[description]

# Push branch to remote
git push -u origin feature/[story-id]-[description]

# Confirm
git branch --show-current
```

### 3b. Create Worktree (Alternative for Parallel Work)

Use this instead of Step 3 if you need to work on multiple stories simultaneously:

```bash
cd $CLAUDE_PROJECT_DIR

# Create worktree with branches (both API and UI)
./scripts/run.sh git/worktree-manager.sh create [story-id] feat/[story-id]-[description]

# Example: Story 5-2
./scripts/run.sh git/worktree-manager.sh create 5-2 feat/5-2-csv-import

# For API-only work
./scripts/run.sh git/worktree-manager.sh create [story-id] feat/[story-id]-[description] api

# For UI-only work
./scripts/run.sh git/worktree-manager.sh create [story-id] feat/[story-id]-[description] ui
```

This creates:
- Worktree at `worktrees/[story-id]/API` and/or `UI`
- Session file at `.session/wt-[story-id].md`
- Branches created from develop

**Skip to Step 5b** if using worktrees.

### 4. Document the Work

Edit `.session/{STORY_ID}-session.md`:

```markdown
# Feature: [Story Title]

**Story ID:** [STORY-123]
**Repos:** [X] API  [X] UI  [ ] Both
**Branches:** 
- API: feature/[story-id]-[description]
- UI: feature/[story-id]-[description]
**Date:** [YYYY-MM-DD]

## Goal
[One sentence - what are you building?]

## Story Description
[Copy relevant parts of the story]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

## API Changes
- Files: [list expected files]
- Endpoints: [list new/modified endpoints]
- Branch: feature/[story-id]-[description]

## UI Changes
- Files: [list expected files]
- Components: [list new/modified components]
- Branch: feature/[story-id]-[description]

## Technical Notes
[Any technical considerations, dependencies, etc.]

## Testing Plan
- [ ] API unit tests
- [ ] UI component tests
- [ ] Integration tests
- [ ] Manual testing

## Done
- [ ] All acceptance criteria met
- [ ] Tests pass
- [ ] Code reviewed
- [ ] Branches merged
- [ ] Deployed

## Next Steps
[What happens after this story is complete?]
```

### 6. Verify Setup

Check that everything is ready:

```bash
# Check API branch
cd $CLAUDE_PROJECT_DIR/API
git branch --show-current
# Should show: feature/[story-id]-[description]

# Check UI branch
cd $CLAUDE_PROJECT_DIR/UI
git branch --show-current
# Should show: feature/[story-id]-[description]

# Check Pennyfarthing session exists
cd $CLAUDE_PROJECT_DIR
ls -la .session/{STORY_ID}-session.md
# Should exist
```

### 5b. Document Worktree Work (if using worktrees)

The worktree manager already created a session file. Edit `.session/wt-[story-id].md` with the same content as Step 5.

### 7. Start Development

You're now ready to start work:

**Standard (in-place branches):**
```bash
# Work in API
cd $CLAUDE_PROJECT_DIR/API
# You're on feature branch, AI loads session + API context

# Work in UI
cd $CLAUDE_PROJECT_DIR/UI
# You're on feature branch, AI loads session + UI context
```

**Worktree (parallel work):**
```bash
# Work in API worktree
cd $CLAUDE_PROJECT_DIR/worktrees/[story-id]/API

# Work in UI worktree
cd $CLAUDE_PROJECT_DIR/worktrees/[story-id]/UI

# Get port configuration for dev servers
eval $(./scripts/run.sh git/worktree-manager.sh ports [story-id])
echo "API: $API_PORT, UI: $UI_PORT"
```

## Example: Complete Workflow

### Story: "Add User Authentication"

```bash
# 1. Create API branch
cd $CLAUDE_PROJECT_DIR/API
git checkout main && git pull
git checkout -b feature/AUTH-123-user-authentication
git push -u origin feature/AUTH-123-user-authentication

# 2. Create UI branch
cd ../UI
git checkout main && git pull
git checkout -b feature/AUTH-123-user-authentication
git push -u origin feature/AUTH-123-user-authentication

# 3. Edit session file
# Update .session/{STORY_ID}-session.md with story details

# 5. Start working
cd API
# Implement auth endpoints

cd ../UI
# Implement login UI
```

## Tips

### Branch Naming Best Practices

- **Be consistent** - Use same branch name in both repos for related work
- **Include story ID** - Makes it easy to track back to requirements
- **Keep it short** - But descriptive enough to understand at a glance
- **Use prefixes** - feature/, bugfix/, etc. for clarity

### When to Create Branches

- **Both repos affected** - Create matching branches in both
- **Single repo** - Only create branch where needed
- **Uncertain** - Start with both, delete unused later

### Branch Cleanup

After merging:
```bash
# Delete local branch
git branch -d feature/[story-id]-[description]

# Delete remote branch
git push origin --delete feature/[story-id]-[description]
```

## Troubleshooting

### Already have uncommitted changes?

```bash
# Stash changes
git stash

# Create branch
git checkout -b feature/[story-id]-[description]

# Apply stashed changes
git stash pop
```

### Wrong branch name?

```bash
# Rename local branch
git branch -m old-name new-name

# Delete old remote branch
git push origin --delete old-name

# Push new branch
git push -u origin new-name
```

### Forgot to pull main first?

```bash
# Fetch latest
git fetch origin

# Rebase your branch on latest main
git rebase origin/main
```

## Integration with Pennyfarthing

This workflow integrates with the solo dev Pennyfarthing structure:

1. **Branches** - Git manages code isolation
2. **Session** - Pennyfarthing tracks work progress
3. **Context** - Repo context files guide AI
4. **Archive** - When done, archive session and delete branches

**Workflow:**
```
Story → Branches → Pennyfarthing Session → Development → Merge → Archive
```

## Quick Reference

```bash
# Create API branch
cd API && git checkout main && git pull && \
git checkout -b feature/STORY-ID-description && \
git push -u origin feature/STORY-ID-description

# Create UI branch
cd ../UI && git checkout main && git pull && \
git checkout -b feature/STORY-ID-description && \
git push -u origin feature/STORY-ID-description

# Edit session
# Update .session/{STORY_ID}-session.md

# Start work
cd API  # or UI
```

---

**You're ready to start development with coordinated branches and Pennyfarthing tracking!**
