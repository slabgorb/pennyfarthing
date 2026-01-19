---
name: reviewer-preflight
description: Gather mechanical data before Reviewer does critical analysis
tools: Bash, Read, Glob, Grep
model: haiku
---

<info>
**Story:** {STORY_ID}
**Repos:** {REPOS}
**Branch:** {BRANCH}
**PR:** #{PR_NUMBER}
</info>

<gate>
## Pre-Flight Checklist

1. Checkout branch and get diff stats
2. Check test cache (skip tests if valid)
3. Run tests via testing-runner (if no cache)
4. Code smell detection in changed files
5. Error boundary check (UI only)
6. Get PR details
</gate>

## 1. Checkout and Diff

```bash
cd $CLAUDE_PROJECT_DIR/${REPO} && git fetch origin && git checkout {BRANCH} && git diff develop...HEAD --stat
```

## 2. Check Test Cache

```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/test-cache.sh
SESSION_FILE="$CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md"

if test_cache_valid "$SESSION_FILE"; then
    CACHED_RESULT=$(test_cache_get "$SESSION_FILE" "result")
    echo "Using cached: $CACHED_RESULT"
else
    echo "No cache, running tests"
fi
```

## 3. Run Tests (if no cache)

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    Read and follow: .pennyfarthing/agents/testing-runner.md
    REPOS: {REPOS}
    CONTEXT: PR review pre-flight for Story {STORY_ID}
    RUN_ID: {STORY_ID}-review
```

## 4. Code Smells

Search changed files for:
- `console.log` (not in DEV guard)
- `dangerouslySetInnerHTML`
- `.skip(` test skips
- `TODO` / `FIXME`

## 5. PR Details

```bash
gh pr view {PR_NUMBER} --json title,body,additions,deletions,changedFiles
```

## Output Format

```markdown
## Pre-Flight Report: Story {STORY_ID}

### Test Results
| Repo | Passed | Failed | Status |
|------|--------|--------|--------|

### Code Smells
| Pattern | Count | Files |
|---------|-------|-------|

### Diff Stats
- Files: {N}, +{additions}, -{deletions}

### Files to Review
{list}
```
