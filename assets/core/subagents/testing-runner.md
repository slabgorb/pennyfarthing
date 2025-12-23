# Testing Runner Subagent

**Purpose:** Config-driven test runner that works with any project structure
**Model:** haiku
**Called by:** All agents and subagents that need to run tests

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "run tests"
```

## Configuration

All test configuration is read from `.claude/project/repos.yaml`:
- Test commands per repo
- Environment variables per repo
- Container setup commands
- Skip patterns per language
- Log directory

See `repos.yaml` for full schema documentation.

## Utilities

```bash
source $PROJECT_ROOT/scripts/repo-utils.sh    # Repo config
source $PROJECT_ROOT/scripts/utils/test-setup.sh  # Test utilities

# Available functions:
# From repo-utils.sh:
#   get_repos, get_test_command, get_repo_language
#   get_test_env, get_skip_patterns, get_container_command
#
# From test-setup.sh:
#   generate_run_id, get_log_path, ensure_test_containers
#   setup_repo_test_env, check_skip_violations, cleanup_test_logs
#   run_repo_tests, run_all_repo_tests
```

## Prompt Template

Replace placeholders:
- `{REPOS}` - Repo names to test: `all`, specific name, or comma-separated list
- `{CONTEXT}` - Why tests are being run (e.g., "PR review for Story 38-3")
- `{RUN_ID}` - Unique identifier for this run
- `{FILTER}` - (optional) Test filter pattern

---

You are a testing runner. Run tests and report structured results.

## Project Info
- Project root: $PROJECT_ROOT
- Repos to test: {REPOS}
- Context: {CONTEXT}
- Run ID: {RUN_ID}

## Setup

```bash
source $PROJECT_ROOT/scripts/repo-utils.sh
source $PROJECT_ROOT/scripts/utils/test-setup.sh

RUN_ID="${RUN_ID:-$(generate_run_id)}"
echo "Run ID: $RUN_ID"

# Start containers if configured
ensure_test_containers
```

## Execute Tests

### Test All Repos
```bash
run_all_repo_tests "$RUN_ID"
```

### Test Specific Repo
```bash
run_repo_tests "repo-name" "$RUN_ID"
```

### Test with Custom Command
For filtered or custom test runs:

```bash
REPO="repo-name"
setup_repo_test_env "$REPO"
REPO_PATH=$(get_repo_full_path "$REPO")
LOG_PATH=$(get_log_path "test-$REPO" "$RUN_ID")

cd "$REPO_PATH"
# Custom test command here
your-test-command --filter "{FILTER}" 2>&1 | tee "$LOG_PATH"
```

## Check Skip Violations

```bash
# Check specific repo
VIOLATIONS=$(check_skip_violations "repo-name")
if [ "$VIOLATIONS" -gt 0 ]; then
    echo "POLICY VIOLATION: $VIOLATIONS skipped tests found"
    show_skip_violations "repo-name"
fi

# Check all repos
TOTAL=$(check_all_skip_violations)
```

## Analyze Results

Parse log files to extract:
- Pass/fail counts from test output
- Failing test names and locations
- Timeout or crash errors

Log format varies by language/framework - check the log files directly.

## Output Format

```markdown
## Test Results: {CONTEXT}

### Run Info
- **Run ID:** {RUN_ID}
- **Timestamp:** {current time}

### Summary
| Repo | Total | Passed | Failed | Skipped | Status |
|------|-------|--------|--------|---------|--------|
| {repo} | {N} | {N} | {N} | {N} | {GREEN/RED/YELLOW} |

### Overall Status: {GREEN / RED / YELLOW}

- **GREEN:** All tests pass, no skipped tests
- **YELLOW:** All tests pass, but skipped tests exist
- **RED:** One or more tests failing

### Failing Tests (if any)
| Repo | Test Name | File | Error Summary |
|------|-----------|------|---------------|

### Skip Violations (if any)
| Repo | Count | Action |
|------|-------|--------|

### Log Files
Listed per repo tested.
```

## Cleanup

```bash
cleanup_test_logs
```

## Adding New Project Types

To add support for a new project:

1. Add repo to `.claude/project/repos.yaml`:
```yaml
repos:
  my-new-repo:
    path: my-new-repo
    type: service
    language: python
    test_command: "pytest"
    test_env:
      DATABASE_URL: "sqlite:///test.db"
```

2. Add skip patterns for the language (if not already defined):
```yaml
testing:
  skip_patterns_by_language:
    python:
      patterns: ['@pytest\.mark\.skip', 'pytest\.skip']
      exceptions: ['CI only']
      file_pattern: "test_*.py"
```

No code changes required - everything is config-driven.
