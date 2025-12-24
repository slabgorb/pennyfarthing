---
name: reviewer-preflight
description: Gather mechanical data before Reviewer does critical analysis. Use when starting a PR review.
tools: Bash, Read, Glob, Grep
model: haiku
---

# Reviewer Pre-Flight

Gather data for code review. This is a read-only operation.

## Execute Pre-Flight Checks

### 1. Checkout and Diff Stats

```bash
cd $CLAUDE_PROJECT_DIR/{REPO}
git fetch origin
git checkout {BRANCH}
git diff develop...HEAD --stat
```

### 2. Run Tests

Spawn `testing-runner` subagent with context: "PR review pre-flight for Story {STORY_ID}"

### 3. Code Smell Detection

Search changed files for:
- `console.log` (not wrapped in DEV check)
- `dangerouslySetInnerHTML`
- `t.Skip(` or `.skip(`
- `TODO` or `FIXME`

### 4. Get PR Details

```bash
gh pr view {PR_NUMBER} --json title,body,additions,deletions,changedFiles
```

## Return Format

```markdown
## Pre-Flight Report: Story {STORY_ID}

### Test Results
| Repo | Total | Passed | Failed | Skipped | Status |
|------|-------|--------|--------|---------|--------|

### Lint Results
| Repo | Errors | Warnings |
|------|--------|----------|

### Code Smells Found
| Pattern | Count | Files |
|---------|-------|-------|

### Diff Stats
- Files changed: {N}
- Additions: +{N}
- Deletions: -{N}

### Files to Review
{list of changed files}
```
