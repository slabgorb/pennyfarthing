# Story 1-4b: Split testing-runner.md subagent - Technical Context

## Story Overview
- **Epic:** 1 - Agentic Best Practices Implementation
- **Points:** 2 (Trivial)
- **Priority:** P2
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11125

## Current State

`testing-runner.md` is 361 lines with duplicated infrastructure code:
- Test container setup repeated in multiple places
- Environment variable exports duplicated 4 times
- RUN_ID generation pattern repeated
- Log file tee operations scattered throughout

Story 1-4a established the pattern: extract utilities to `scripts/utils/` and have subagents source them.

## Technical Approach

Follow the 1-4a pattern exactly:
1. Create `scripts/utils/test-setup.sh` with reusable functions
2. Refactor `testing-runner.md` to source and use these functions
3. Keep subagent focused on orchestration, not implementation

## Files to Modify

| File | Action |
|------|--------|
| `scripts/utils/test-setup.sh` | CREATE - New utility library |
| `.claude/subagents/testing-runner.md` | REFACTOR - Source test-setup.sh, remove duplication |

## Functions to Extract to test-setup.sh

```bash
# Container management
check_test_containers()    # Verify test containers running
start_test_containers()    # Start if not running

# Environment setup
setup_test_env()           # Export TEST_DATABASE_URL, MONGODB_TEST_URI

# Run ID and logging
generate_run_id()          # Create timestamp-based unique ID
get_log_path()             # Return .session/test-{id}.log path

# Result parsing
parse_go_test_results()    # Extract pass/fail from go test output
parse_npm_test_results()   # Extract pass/fail from npm test output
check_skip_violations()    # Grep for forbidden .Skip patterns

# Cleanup
cleanup_test_logs()        # Remove old log files
```

## Acceptance Criteria
- [ ] Test container setup extracted to scripts/utils/test-setup.sh
- [ ] testing-runner.md reduced to <250 lines
- [ ] Test workflows still function correctly

## Testing Strategy

1. Source test-setup.sh and verify functions exist
2. Run each function manually to confirm behavior
3. Execute a test run via testing-runner to confirm integration

## Reference Files

- `scripts/utils/repo-scan.sh` - Pattern to follow (142 lines, clean function isolation)
- `.claude/subagents/workflow-status-check.md` - Shows refactored result (197 lines, sources repo-scan.sh)

## Dependencies & Risks

- Low risk - purely internal refactoring
- No external dependencies
- Must preserve existing behavior exactly
