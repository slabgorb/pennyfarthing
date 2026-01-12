---
description: Quick commit for small changes without full git-cleanup ceremony
---

# Quick Chore Commit

Quickly commit dirty changes without the full `/git-cleanup` ceremony. Creates a branch, commits, merges to develop, and pushes in one command.

<purpose>
Fast path for committing small changes that don't warrant story tracking.
</purpose>

<usage>
```bash
# Default: chore commit (auto-generate message)
/chore

# Chore with custom message
/chore "update sprint tracking"

# Variants for different commit types
/chore doc                       # docs: prefix, docs/* branch
/chore doc "update README"       # docs: with custom message
/chore ux                        # style: prefix, ux/* branch
/chore ux "adjust button spacing"
```
</usage>

<variants>
| Command | Branch | Commit Prefix | Use For |
|---------|--------|---------------|---------|
| `/chore` | `chore/*` | `chore:` | Maintenance, config, scripts |
| `/chore doc` | `docs/*` | `docs:` | Documentation, README, guides |
| `/chore ux` | `ux/*` | `style:` | UI tweaks, CSS, styling |
</variants>

<workflow>
**CRITICAL: Never commit directly to develop. Branch protection hooks will reject direct commits.**

1. Verify dirty files exist (abort if clean)
2. Determine variant (chore/doc/ux) from first arg
3. Create branch from develop: `{variant}/{timestamp}`
4. Stage all changes
5. Generate or use provided commit message
6. Commit with conventional format
7. Merge to develop locally
8. Push develop
9. Delete local branch
</workflow>

## Execution

### Step 1: Pre-Flight

```bash
# Abort if clean
if git diff --quiet && git diff --cached --quiet; then
  echo "ERROR: No changes to commit."
  exit 1
fi

echo "=== Changes to Commit ==="
git status --short
```

### Step 2: Parse Arguments

```bash
# Defaults
VARIANT="chore"
PREFIX="chore"
BRANCH_TYPE="chore"
MESSAGE=""

# Check first arg
case "$1" in
  doc|docs)
    VARIANT="docs"
    PREFIX="docs"
    BRANCH_TYPE="docs"
    shift
    ;;
  ux|style)
    VARIANT="ux"
    PREFIX="style"
    BRANCH_TYPE="ux"
    shift
    ;;
esac

# Remaining args are the message
MESSAGE="$*"
```

### Step 3: Generate Message (if needed)

```bash
if [ -z "$MESSAGE" ]; then
  CHANGED_FILES=$(git status --porcelain | awk '{print $2}')

  case "$VARIANT" in
    docs)
      if echo "$CHANGED_FILES" | grep -qi "readme"; then
        MESSAGE="update README"
      elif echo "$CHANGED_FILES" | grep -qi "changelog"; then
        MESSAGE="update changelog"
      else
        MESSAGE="update documentation"
      fi
      ;;
    ux)
      if echo "$CHANGED_FILES" | grep -qE "\.css|\.scss"; then
        MESSAGE="update styles"
      else
        MESSAGE="update styling"
      fi
      ;;
    chore)
      if echo "$CHANGED_FILES" | grep -q "sprint/"; then
        MESSAGE="update sprint tracking"
      elif echo "$CHANGED_FILES" | grep -q "\.claude/"; then
        MESSAGE="update pennyfarthing config"
      elif echo "$CHANGED_FILES" | grep -q "scripts/"; then
        MESSAGE="update scripts"
      else
        FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
        MESSAGE="minor updates to ${FILE_COUNT} files"
      fi
      ;;
  esac
fi
```

### Step 4: Branch and Commit

```bash
# Stash current changes
git stash push -m "${BRANCH_TYPE}-wip-$(date +%s)"

# Update develop and create branch
git checkout develop && git pull origin develop
BRANCH="${BRANCH_TYPE}/$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"

# Restore changes
git stash pop

# Stage and commit
git add .
git commit -m "${PREFIX}: ${MESSAGE}

Co-Authored-By: Claude <noreply@anthropic.com>"

# Merge and push
git checkout develop
git merge "$BRANCH"
git branch -d "$BRANCH"
git push origin develop
```

## Safety

- **NEVER commit directly to develop**
- **Never force push**
- **Never commit secrets** (.env, credentials)
- **Abort if working directory is clean**

## When to Use

| Use /chore | Use /git-cleanup |
|------------|------------------|
| Single logical change | Multiple unrelated changes |
| Quick fix or tweak | Need to organize into groups |
| One type of change | Mixed types requiring separation |

<related>
- `/git-cleanup` - Full ceremony for organizing multiple changes
</related>
