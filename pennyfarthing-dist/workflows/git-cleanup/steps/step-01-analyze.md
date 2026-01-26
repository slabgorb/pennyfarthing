# Step 1: Analyze Current State

Gather the current git state across all configured repositories.

## Objective

Build a complete picture of:
- Uncommitted changes in each repo
- Unpushed commits on develop
- Active worktrees and their state
- Active work sessions that might explain changes

## Execution

### 1.1 Gather Git Status (All Repos)

```bash
./scripts/run.sh git/git-status-all.sh
```

This shows branch, staged/unstaged changes, and unpushed commits for all repos.

### 1.2 Check Recent Commit Patterns

```bash
echo "=== Recent Commits (for message style) ==="
git log --oneline -10
echo ""
echo "=== Recent Branches ==="
git branch --sort=-committerdate | head -10
```

### 1.3 Check Active Work Sessions

```bash
echo "=== Active Work Sessions ==="
ls -la .session/*.md 2>/dev/null || echo "No active sessions"
```

If sessions exist, read headers to understand what work is in progress.

### 1.4 Check Worktree Status

```bash
echo "=== Worktree Status ==="
./scripts/run.sh git/worktree-manager.sh status 2>/dev/null || echo "No worktrees"
```

### 1.5 Pre-flight Checks

**Before proceeding, verify:**

| Check | Status | Action if Failed |
|-------|--------|------------------|
| No merge conflicts | ☐ | Resolve conflicts first |
| develop is up to date | ☐ | `git pull origin develop` |
| No uncommitted secrets | ☐ | Add to .gitignore |

## Output Format

Present findings in this structure:

```
## Analysis Results

### Repo: {repo_name}
Branch: {current_branch}
Unpushed: {count} commits

**Uncommitted Changes:**
- {file_path} ({status: M/A/D/??})
- ...

### Warnings
- {any issues found}
```

---

**[A]** Analyze a specific repo in more detail
**[C]** Continue to categorization

<!-- CYCLIST:CHOICES:A,C -->
