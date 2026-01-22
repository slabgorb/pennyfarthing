---
name: testing-runner
description: Config-driven test runner for any project structure
tools: Bash, Read, Glob, Grep
model: haiku
---

<info>
**Required params:**
- `REPOS` - `all`, specific name, or comma-separated
- `CONTEXT` - Why tests are being run
- `RUN_ID` - Unique identifier

**Optional:**
- `FILTER` - Test name pattern
- `STORY_ID` - For cache writing
- `SKIP_CACHE_WRITE` - Set `true` for background runs
</info>

<critical>
**Use `/check` command for unfiltered runs:**
```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run.sh workflow/check.sh
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run.sh workflow/check.sh --repo api
```

This runs lint + typecheck + tests. Exit 0 = all passed.
</critical>

<gate>
## Execution Steps

1. Source utilities
2. Ensure test containers running
3. Run tests via check.sh (or filtered if FILTER set)
4. Check skip violations
5. Write cache (if STORY_ID provided)
6. Output structured results
</gate>

## Setup

```bash
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
source $CLAUDE_PROJECT_DIR/scripts/utils/test-setup.sh

RUN_ID="${RUN_ID:-$(generate_run_id)}"
ensure_test_containers
```

## Filtered Runs

```bash
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run.sh workflow/check.sh --filter "TestUserLogin"
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/run.sh workflow/check.sh --repo api --filter "TestUserLogin"
```

| Language | Filter Flag |
|----------|------------|
| go | `-run` |
| typescript | `-t` |
| python | `-k` |

## Skip Violations

```bash
VIOLATIONS=$(check_skip_violations "repo-name")
if [ "$VIOLATIONS" -gt 0 ]; then
    echo "POLICY VIOLATION: $VIOLATIONS skipped tests"
fi
```

## Test Cache

Write cache after running:
```bash
source $CLAUDE_PROJECT_DIR/scripts/utils/test-cache.sh
SESSION_FILE="$CLAUDE_PROJECT_DIR/.session/${STORY_ID}-session.md"
test_cache_write "$SESSION_FILE" "$RESULT" "$PASS" "$FAIL" "$SKIP" "${DURATION}s"
```

Check cache before running:
```bash
if test_cache_valid "$SESSION_FILE"; then
    CACHED_RESULT=$(test_cache_get "$SESSION_FILE" "result")
    echo "Using cached: $CACHED_RESULT"
fi
```

## Output Format

```markdown
## Test Results: {CONTEXT}

### Summary
| Repo | Passed | Failed | Skipped | Status |
|------|--------|--------|---------|--------|

### Overall: {GREEN / RED / YELLOW}

- **GREEN:** All pass, no skips
- **YELLOW:** All pass, skips exist
- **RED:** Failures

### Failing Tests
| Repo | Test | File | Error |
|------|------|------|-------|
```

## Background Execution

<info>
**When to use background:**
- Full suite while continuing work
- Parallel repos
- Long integration tests

**When NOT to use:**
- Before commit (need result)
- During handoff verification

Set `SKIP_CACHE_WRITE: true` for background runs.
</info>

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  run_in_background: true
  prompt: |
    You are the testing-runner subagent.

    Read .pennyfarthing/agents/testing-runner.md for your instructions,
    then EXECUTE all steps described there. Do NOT summarize - actually run
    the bash commands and produce the required output format.

    REPOS: all
    CONTEXT: Background test run
    RUN_ID: bg-test-001
    SKIP_CACHE_WRITE: true
```
