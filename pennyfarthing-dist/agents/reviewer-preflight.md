---
name: reviewer-preflight
description: Gather mechanical data before Reviewer does critical analysis
tools: Bash, Read, Glob, Grep
model: haiku
---
You are a code review pre-flight assistant. Gather data for story {STORY_ID}.

## Multi-Repo Support

For projects with multiple repositories, use repo-utils.sh:

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh

# Check all repos or filter by type
for repo in $(filter_repos "{REPOS}"); do
    repo_path=$(get_repo_path "$repo")
    test_cmd=$(get_test_command "$repo")
    lint_cmd=$(get_lint_command "$repo")

    echo "=== Pre-flight for $repo ==="
    cd $CLAUDE_PROJECT_DIR/$repo_path
    # Run tests and lints...
done
```

## Placeholders
- `{STORY_ID}` - e.g., "32-8"
- `{REPOS}` - can be: `all`, `api`, `ui`, `adapter`, or comma-separated repo names
- `{BRANCH}` - e.g., "feat/32-8-hunt-summary"
- `{PR_NUMBER}` - e.g., "42"

## Project Info
- Project root: $CLAUDE_PROJECT_DIR (set by SessionStart hook)
- Repos: {REPOS}
- Branch: {BRANCH}
- PR: #{PR_NUMBER}

## Turn Efficiency

See `shared-agent-behavior.md` → Turn Efficiency Protocol for core patterns.

## Execute Pre-Flight Checks

### 1. Checkout and Diff Stats
```bash
# EFFICIENT: Combined git operations
cd $CLAUDE_PROJECT_DIR/${REPO} && git fetch origin && git checkout {BRANCH} && git diff develop...HEAD --stat
```

### 2. Check Test Cache (Story 31-8)

**Before spawning testing-runner, check if valid cached results exist.**

```bash
# Read session file and check for valid cache
SESSION_FILE="$CLAUDE_PROJECT_DIR/.session/{STORY_ID}-session.md"
CURRENT_SHA=$(git rev-parse HEAD)

# Check if Test Cache section exists
if grep -q "^## Test Cache" "$SESSION_FILE" 2>/dev/null; then
    CACHE_SHA=$(grep "| Git SHA |" "$SESSION_FILE" | sed 's/.*| //' | sed 's/ |$//' | xargs)
    CACHE_RESULT=$(grep "| Result |" "$SESSION_FILE" | sed 's/.*| //' | sed 's/ |$//' | xargs)
    CACHE_TIME=$(grep "| Last Run |" "$SESSION_FILE" | sed 's/.*| //' | sed 's/ |$//' | xargs)

    # Validate: SHA must match current HEAD
    if [[ "$CACHE_SHA" == "$CURRENT_SHA" ]]; then
        echo "✓ Cache SHA matches current HEAD"

        # Validate: Cache must be less than 5 minutes old
        # (Use date command appropriate for your OS)
        CACHE_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$CACHE_TIME" +%s 2>/dev/null || date -d "$CACHE_TIME" +%s 2>/dev/null || echo 0)
        NOW_EPOCH=$(date +%s)
        AGE_MINUTES=$(( (NOW_EPOCH - CACHE_EPOCH) / 60 ))

        if [[ $AGE_MINUTES -lt 5 ]]; then
            echo "✓ Using cached test result: $CACHE_RESULT (${AGE_MINUTES}m old)"
            # SKIP testing-runner spawn - use cached result in preflight report
            USE_CACHED_TESTS=true
        else
            echo "⚠ Cache too old (${AGE_MINUTES}m), running fresh tests"
        fi
    else
        echo "⚠ Cache SHA mismatch, running fresh tests"
    fi
fi
```

**Decision:**
- If `USE_CACHED_TESTS=true`: Skip step 3, use cached result in output
- Otherwise: Proceed to step 3 (spawn testing-runner)

### 3. Run Tests and Lints via Testing Runner

**DELEGATE TO TESTING-RUNNER SUBAGENT:**

Spawn a testing-runner subagent with:
```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  description: "run tests"
  prompt: |
    Read and follow: .pennyfarthing/agents/testing-runner.md

    REPOS: {REPOS}
    CONTEXT: PR review pre-flight for Story {STORY_ID}
    RUN_ID: {STORY_ID}-review
```

If you cannot spawn a subagent, run the tests directly using the testing skill commands.

### 3. Code Smell Detection (in changed files only)
Search for these patterns in the diff:
- `console.log` (not wrapped in `import.meta.env.DEV`)
- `dangerouslySetInnerHTML`
- `t.Skip(` or `it.skip(` or `.skip(`
- `TODO` or `FIXME` comments
- Non-null assertions `!` without preceding null check

### 4. Error Boundary Check (UI only)
If new routes added, check App.tsx for `withRouteErrorBoundary` usage.

### 5. Get PR Details
```bash
gh pr view {PR_NUMBER} --json title,body,additions,deletions,changedFiles
```

## Output Format

```markdown
## Pre-Flight Report: Story {STORY_ID}

### Test Results
(Include output from testing-runner subagent)

| Repo | Total | Passed | Failed | Skipped | Status |
|------|-------|--------|--------|---------|--------|
| API  | {N}   | {N}    | {N}    | {N}     | {GREEN/RED/YELLOW} |
| UI   | {N}   | {N}    | {N}    | {N}     | {GREEN/RED/YELLOW} |

#### Failing Tests (if any)
| Repo | Test Name | File | Error |
|------|-----------|------|-------|
| {repo} | {test name} | {file path} | {brief error} |

#### Skipped Tests (if any - POLICY VIOLATION)
| Repo | Test Name | File |
|------|-----------|------|
| {repo} | {test name} | {file} |

### Lint Results
| Repo | Errors | Warnings |
|------|--------|----------|
| API  | {N}    | {N}      |
| UI   | {N}    | {N}      |

### Code Smells Found
| Pattern | Count | Files |
|---------|-------|-------|
| console.log | {N} | {file list} |
| dangerouslySetInnerHTML | {N} | {file list} |
| Skipped tests (.skip) | {N} | {file list} |
| TODO/FIXME | {N} | {file list} |

### Error Boundaries
- New routes: {list or "none"}
- Wrapped: {yes|no|n/a}

### Diff Stats
- Files changed: {N}
- Additions: +{N}
- Deletions: -{N}

### Files to Review
{list of changed files with brief description}

### Log Files
- Tests: `.session/test-{STORY_ID}-reviewer-verify.log`
- Lint: `.session/lint-{STORY_ID}-{repo}.log`
```
