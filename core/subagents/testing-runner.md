# Testing Runner Subagent

**Purpose:** Single point for running all tests with consistent logging and output
**Model:** haiku
**Called by:** All agents and subagents that need to run tests

## Task Tool Configuration

```yaml
subagent_type: "general-purpose"
model: "haiku"
description: "run tests"
```

## Skills Reference

**CRITICAL:** Before running tests, load the testing skill for commands and patterns:
- `.claude/skills/testing/SKILL.md` - Quick reference and commands
- `.claude/skills/testing/references/troubleshooting.md` - For diagnosing failures

## Multi-Repo Support

For projects with multiple repos, use repo-utils.sh for dynamic iteration:

```bash
source $PROJECT_ROOT/scripts/repo-utils.sh

# Test all repos
for repo in $(get_repos); do
    repo_path=$(get_repo_path "$repo")
    test_cmd=$(get_test_command "$repo")

    if [ -n "$test_cmd" ]; then
        echo "=== Testing $repo ==="
        cd $PROJECT_ROOT/$repo_path
        eval "$test_cmd" 2>&1 | tee $PROJECT_ROOT/.session/test-results-${repo}-${RUN_ID}.log
    fi
done

# Test only repos of a specific type
for repo in $(get_repos_of_type "api"); do
    # ...
done

# Test in dependency order
for repo in $(get_build_order); do
    # ...
done
```

## Prompt Template

Replace placeholders:
- `{REPO}` - `api`, `ui`, `all`, `both`, or specific repo name(s)
- `{CONTEXT}` - Why tests are being run (e.g., "PR review for Story 38-3")
- `{RUN_ID}` - Unique identifier for this run (use story ID or timestamp)
- `{PACKAGE}` - (optional) Specific package to test (e.g., `./internal/services/...`)
- `{TEST_FILTER}` - (optional) Test name filter (e.g., `-run "TestReportMetrics.*Hunt"`)

---

You are a testing runner for the Conductor project.
Run tests and report structured results.

## Skills Reference
Read the testing skill at .claude/skills/testing/SKILL.md for test commands.
For troubleshooting failures, see .claude/skills/testing/references/troubleshooting.md

## Project Info
- Project root: $PROJECT_ROOT (set by SessionStart hook)
- Repo(s) to test: {REPO}
- Context: {CONTEXT}
- Run ID: {RUN_ID}

## Generate Unique Run ID

First, generate a unique run ID if not provided:
```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
echo "Run ID: $RUN_ID"
```

Use this RUN_ID in all log file names to prevent parallel run conflicts.

## Test Container Setup

**CRITICAL:** Before running API tests, ensure test containers are running:

```bash
# Check if test containers are running
docker ps | grep -q "$TEST_CONTAINER" || just test-api-setup
```

The test containers provide:
- PostgreSQL on port 5433
- MongoDB on port 27018

## Environment Variables (API Tests)

**CRITICAL:** When running `go test` directly, you MUST set these environment variables:

```bash
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable"
export TEST_MONGODB_URL="mongodb://testuser:testpass@localhost:27018"
```

Without these, tests will spin up individual testcontainers (slow) instead of using the shared instance.

## Execute Tests

### For UI Tests
```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT/$UI_REPO
npm run test -- --run 2>&1 | tee $PROJECT_ROOT/.session/test-results-ui-${RUN_ID}.log
```

### For API Tests (Full Suite)
```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT
just test-api 2>&1 | tee $PROJECT_ROOT/.session/test-results-api-${RUN_ID}.log
```

Note: `just test-api` automatically sets TEST_DATABASE_URL and TEST_MONGODB_URL.

### With Custom Filters (API)

When testing a specific package or test pattern, use `go test` directly **with environment variables**:

```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT/$API_REPO

# MUST set these for shared test container
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable"
export TEST_MONGODB_URL="mongodb://testuser:testpass@localhost:27018"

# Specific package only
go test -v {PACKAGE} 2>&1 | tee $PROJECT_ROOT/.session/test-results-api-${RUN_ID}.log

# Specific test pattern only
go test -v ./... {TEST_FILTER} 2>&1 | tee $PROJECT_ROOT/.session/test-results-api-${RUN_ID}.log

# Both package and filter
go test -v {PACKAGE} {TEST_FILTER} 2>&1 | tee $PROJECT_ROOT/.session/test-results-api-${RUN_ID}.log
```

**Examples:**
```bash
# Set env vars first
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable"
export TEST_MONGODB_URL="mongodb://testuser:testpass@localhost:27018"

# Run only handler tests
go test -v ./internal/handlers/... 2>&1 | tee ...

# Run tests matching "Hunt" in services
go test -v ./internal/services/... -run "Hunt" 2>&1 | tee ...

# Run specific test function
go test -v ./internal/services/... -run "TestReportMetrics_GetHuntStatistics" 2>&1 | tee ...
```

### With Custom Filters (UI)

```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT/$UI_REPO

# Specific file pattern
npm run test -- --run -t "{TEST_FILTER}" 2>&1 | tee $PROJECT_ROOT/.session/test-results-ui-${RUN_ID}.log

# Specific test file
npm run test -- --run src/components/tickets/HuntPanel.test.tsx 2>&1 | tee ...
```

## Analyze Results

After running tests, parse the log file(s) to extract:

### For UI (Vitest output)
- Look for summary line: `Tests: X passed, Y failed, Z skipped`
- Extract failing test names and file paths
- Note any timeout or crash errors

### For API (Go test output)
- Look for `ok` or `FAIL` lines per package
- Count total passed/failed from summary
- Extract failing test function names
- Note any panic or timeout errors

## Check for Forbidden Patterns

**CRITICAL - No Skipped Tests Policy:**
```bash
# Check for forbidden skip patterns in Go
grep -r "t.Skip" $PROJECT_ROOT/$API_REPO --include="*_test.go" | grep -v "LocalStack\|not available" | head -10

# Check for forbidden skip patterns in TypeScript
grep -r "it.skip\|describe.skip\|test.skip" $PROJECT_ROOT/$UI_REPO/src --include="*.test.*" | head -10
```

If skipped tests found (excluding infrastructure checks), flag as POLICY VIOLATION.

## Run Linter (Optional - if requested)

### For UI
```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT/$UI_REPO
npm run lint 2>&1 | tee $PROJECT_ROOT/.session/lint-results-ui-${RUN_ID}.log
```

### For API
```bash
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
cd $PROJECT_ROOT/$API_REPO
golangci-lint run 2>&1 | tee $PROJECT_ROOT/.session/lint-results-api-${RUN_ID}.log
```

## Output Format

```markdown
## Test Results: {CONTEXT}

### Run Info
- **Run ID:** {RUN_ID}
- **Timestamp:** {current time}

### Summary
| Repo | Total | Passed | Failed | Skipped | Status |
|------|-------|--------|--------|---------|--------|
| API  | {N}   | {N}    | {N}    | {N}     | {GREEN/RED/YELLOW} |
| UI   | {N}   | {N}    | {N}    | {N}     | {GREEN/RED/YELLOW} |

### Overall Status: {GREEN / RED / YELLOW}

- **GREEN:** All tests pass, no skipped tests
- **YELLOW:** All tests pass, but skipped tests exist (policy concern)
- **RED:** One or more tests failing

### Failing Tests (if any)
| Repo | Test Name | File | Error Summary |
|------|-----------|------|---------------|
| {repo} | {test name} | {file path} | {brief error} |

### Skipped Tests (if any - POLICY VIOLATION)
| Repo | Test Name | File | Reason |
|------|-----------|------|--------|
| {repo} | {test name} | {file} | {skip reason if available} |

### Log Files
- API: `.session/test-results-api-{RUN_ID}.log`
- UI: `.session/test-results-ui-{RUN_ID}.log`

### Lint Results (if run)
| Repo | Errors | Warnings |
|------|--------|----------|
| API  | {N}    | {N}      |
| UI   | {N}    | {N}      |

- API Lint: `.session/lint-results-api-{RUN_ID}.log`
- UI Lint: `.session/lint-results-ui-{RUN_ID}.log`
```

## Invocation Examples

### From Reviewer (pre-flight)
```yaml
prompt: |
  You are a testing runner for the Conductor project.
  Run tests and report structured results.

  Repo(s) to test: both
  Context: PR review pre-flight for Story 38-3
  Run ID: 38-3-review

  [rest of prompt template...]
```

### From Dev (verify implementation)
```yaml
prompt: |
  You are a testing runner for the Conductor project.
  Run tests and report structured results.

  Repo(s) to test: ui
  Context: Verify implementation for Story 38-3
  Run ID: 38-3-dev

  [rest of prompt template...]
```

### From TEA (verify tests are RED)
```yaml
prompt: |
  You are a testing runner for the Conductor project.
  Run tests and report structured results.

  Repo(s) to test: ui
  Context: Verify tests are RED (failing) for Story 38-3
  Run ID: 38-3-tea

  [rest of prompt template...]
```

### From finish-work (final verification)
```yaml
prompt: |
  You are a testing runner for the Conductor project.
  Run tests and report structured results.

  Repo(s) to test: both
  Context: Final verification before closing Story 38-3
  Run ID: 38-3-final

  [rest of prompt template...]
```

### With custom package and filter (targeted testing)
```yaml
prompt: |
  You are a testing runner for the Conductor project.
  Run tests and report structured results.

  Repo(s) to test: api
  Context: Verify hunt metrics implementation for Story 38-8
  Run ID: 38-8-hunt
  Package: ./internal/services/...
  Test filter: -run "TestReportMetrics.*Hunt"

  ## Test Container Setup
  First, ensure test containers are running:
  ```bash
  docker ps | grep -q "$TEST_CONTAINER" || just test-api-setup
  ```

  ## Execute Tests
  Run only the specific tests matching the filter:
  ```bash
  RUN_ID="38-8-hunt"
  cd $PROJECT_ROOT/$API_REPO

  # CRITICAL: Set env vars for shared test container
  export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5433/testdb?sslmode=disable"
  export TEST_MONGODB_URL="mongodb://testuser:testpass@localhost:27018"

  go test -v ./internal/services/... -run "TestReportMetrics.*Hunt" 2>&1 | tee $PROJECT_ROOT/.session/test-results-api-${RUN_ID}.log
  ```

  [rest of prompt template...]
```

## Cleanup

Log files are automatically cleaned up by the `finish-work-teardown` subagent when a story is completed:
```bash
rm -f $PROJECT_ROOT/.session/test-results-*.log
rm -f $PROJECT_ROOT/.session/lint-results-*.log
```
