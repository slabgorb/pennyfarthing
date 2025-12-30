---
description: Clean up git repos by organizing changes into proper commits/branches by initiative
---

# Git Cleanup Command

Analyze and organize uncommitted changes across all repos into proper commits and branches based on initiative/feature groupings.

## Git Workflow Rules

**CRITICAL: Never commit directly to develop. Branch protection hooks will reject direct commits.**

All changes MUST follow this workflow:
1. Create a branch from develop
2. Commit changes to the branch
3. Merge to develop locally
4. Push develop (branches don't need to be pushed)

## Analysis Phase

### 1. Gather Current State and Check for Unpushed Commits

```bash
./scripts/run.sh git-status-all.sh
```

This shows branch, changes, and unpushed commits for all repos.

### 2. Check Recent Commits for Patterns

```bash
echo "=== Recent Commit Patterns ==="
git log --oneline -10 | head -10
echo ""
echo "=== Recent Branches ==="
git branch --sort=-committerdate | head -10
```

### 3. Check Active Work Sessions

```bash
echo "=== Active Work ==="
if [ -f ".session/{STORY_ID}-session.md" ]; then
  head -30 .session/{STORY_ID}-session.md
else
  echo "No active work session"
fi
```

### 4. Check Worktree Status

```bash
echo "=== Worktree Status ==="
./scripts/run.sh worktree-manager.sh status
```

This shows all active worktrees with their branches and uncommitted changes.

### 5. Check Epics for Story Context

```bash
echo "=== Active Epics ==="
head -60 docs/epics.md
```

## Categorization Guidelines

Group changes by these initiative types (based on conventional commits):

| Prefix | Type | Branch Pattern | Example |
|--------|------|----------------|---------|
| `docs:` | Documentation | `docs/description` | docs/update-epics |
| `chore:` | Maintenance | `chore/description` | chore/sprint-cleanup |
| `chore(sprint):` | Sprint tracking | `chore/sprint-update` | - |
| `chore(pennyfarthing):` | Pennyfarthing config | `chore/pennyfarthing-cleanup` | - |
| `feat:` | New feature | `feat/story-id-desc` | feat/4-12-risk-scoring |
| `fix:` | Bug fix | `fix/issue-desc` | fix/validation-error |
| `refactor:` | Code improvement | `refactor/description` | refactor/seed-data |

## Common Change Categories

### Sprint/Docs Changes
Files: `docs/*.md`, `sprint/*.yaml`, `sprint/*.md`
- Branch: `chore/sprint-cleanup` or `docs/update-[topic]`
- Commit: `chore(sprint): update sprint tracking` or `docs: update documentation`

### Pennyfarthing Configuration
Files: `.claude/**/*`
- Branch: `chore/pennyfarthing-[description]`
- Commit: `chore(pennyfarthing): description`

### Feature Work
Files: `internal/**`, `src/**`, `migrations/**`
- Branch: `feat/[story-id]-description`
- Commit: `feat: description`

### Seed/Test Data
Files: `internal/seed/**`, `cmd/seed/**`
- Branch: `chore/seed-improvements` or part of feature branch
- Commit: `chore(seed): description`

### Bug Fixes
Files: Various
- Branch: `fix/[issue-description]`
- Commit: `fix: description`

## Execution Phase - Branch Workflow

**For each group of changes, follow this exact workflow:**

### Step 1: Stash All Changes First
```bash
# Stash everything to start clean
git stash push -m "cleanup-wip"
```

### Step 2: Create Branch from Develop
```bash
# Ensure on develop and up to date
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b type/description
```

### Step 3: Apply Relevant Changes
```bash
# Pop stash
git stash pop

# Stage only files for this group
git add <specific-files>

# Stash remaining changes for next group
git stash push -m "remaining-cleanup"
```

### Step 4: Commit
```bash
# Commit with proper message
git commit -m "$(cat <<'EOF'
type(scope): description

Details if needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Step 5: Merge to Develop
```bash
# Switch to develop
git checkout develop

# Merge the branch
git merge type/description

# Delete local branch
git branch -d type/description
```

### Step 6: Repeat for Next Group
```bash
# Pop remaining stash and repeat from Step 2
git stash pop
```

## Multi-Repo Cleanup Pattern

When cleaning up changes across multiple repos (configured in `.claude/project/repos.yaml`):

```bash
# Source repo utilities
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# For each configured repo, run the same workflow
for_each_repo '
  # ... branch workflow ...
  git status --short
'
```

Or manually iterate:

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
for repo in $(get_repos); do
  repo_path=$(get_repo_full_path "$repo")
  echo "=== Processing $repo ==="
  cd "$repo_path"
  # ... branch workflow ...
  cd -
done
```

## Interactive Cleanup Process

When running this command, Claude should:

1. **Show current state** - Display all uncommitted changes grouped by repo
2. **Check for unpushed commits** - Identify any commits on develop not yet pushed
3. **Analyze changes** - Look for patterns in file paths, recent commits, and epics
4. **Propose groupings** - Suggest how to organize changes:
   ```
   Group 1: Sprint Updates
   - docs/epics.md
   - sprint/current-sprint.yaml
   → Branch: chore/sprint-cleanup
   → Commit: "chore(sprint): clean up sprint tracking files"

   Group 2: Migration Fix
   - migrations/056_*.sql
   → Branch: fix/risk-scoring-migration
   → Commit: "fix(db): add missing risk scoring migration"

   Group 3: Seed Improvements
   - internal/seed/*.go
   → Branch: chore/seed-improvements
   → Commit: "chore(seed): improve demo data generation"
   ```
4. **Ask for confirmation** - Let user approve or modify groupings
5. **Execute** - Create branches, commit, merge to develop for each group
6. **Push develop** - Push all merged changes at the end
7. **Verify** - Show clean git status at the end

## Safety Rules

- **NEVER commit directly to develop** - hooks will reject it
- **Never force push**
- **Never commit secrets** (.env, credentials, etc.)
- **Show diff before committing**
- **Respect .gitignore**
- **Handle unpushed commits on develop before starting cleanup**

## Quick Reference

```bash
# View what needs cleanup (all repos)
./scripts/run.sh git-status-all.sh

# Create cleanup branch
git checkout develop && git pull
git checkout -b chore/cleanup-$(date +%Y%m%d)

# Stage specific files
git add "docs/*.md"
git add "sprint/*.yaml"

# Commit with proper message (use heredoc for multiline)
git commit -m "$(cat <<'EOF'
chore(sprint): update sprint status

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Merge to develop (local)
git checkout develop
git merge chore/cleanup-$(date +%Y%m%d)
git branch -d chore/cleanup-$(date +%Y%m%d)

# Push develop after all merges complete
git push origin develop
```

## Branch Cleanup

Stale feature branches can accumulate over time. Include branch cleanup as part of git hygiene.

### Check for Stale Branches

```bash
echo "=== Branch Status ==="

./scripts/run.sh check-status.sh
```

### Remove Merged Branches

**Only remove branches that are fully merged:**

```bash
# Source repo utilities
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# For each configured repo
for repo in $(get_repos); do
  repo_path=$(get_repo_full_path "$repo")
  echo "=== $repo ==="
  cd "$repo_path"

  git checkout develop
  git pull origin develop

  # List branches merged into develop
  git branch --merged develop | grep -v "develop\|main"

  # Delete merged branches
  git branch --merged develop | grep -v "develop\|main" | xargs -r git branch -d

  cd -
done
```

### Branch Cleanup Criteria

| Branch Type | When to Remove |
|-------------|----------------|
| `feat/*` | After PR merged to develop |
| `fix/*` | After PR merged to develop |
| `chore/*` | After PR merged to develop |

**Note:** Never delete `main` or `develop` branches.

## Post-Cleanup Verification

```bash
echo "=== Final State ==="
./scripts/run.sh git-status-all.sh
echo ""
echo "=== Branches ==="

# Source repo utilities
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

for repo in $(get_repos); do
  repo_path=$(get_repo_full_path "$repo")
  echo "$repo:" && git -C "$repo_path" branch
done
```

---

**Start by analyzing, then propose groupings, then execute with user approval. Always use branches!**
