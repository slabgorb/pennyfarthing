# Story 1-4a: Split workflow-status-check.md subagent - Summary

**Completed:** 2025-12-22
**Points:** 2 | **Epic:** Agentic Best Practices Implementation

## What Was Built

Extracted repo scanning logic from the universal workflow-status-check subagent into a dedicated reusable utility (`scripts/utils/repo-scan.sh`), reducing the subagent's complexity and making git status scanning available to other parts of the system.

## Key Technical Decisions

1. **Utility Location:** Placed in `scripts/utils/` following existing patterns (repo-utils.sh)
2. **Output Format:** Chose pipe-delimited format (`repo|branch|uncommitted|ahead`) for easy parsing in bash
3. **Graceful Degradation:** Functions return identifiable failure formats rather than erroring, allowing callers to handle missing repos/PRs
4. **Fallback Strategy:** `scan_all_repos_status` falls back to directory scanning if repo-utils.sh unavailable

## Implementation Patterns

- **Function Signatures:** Clear documentation in header comments with return format
- **Error Handling:** `set +e` at top, `2>/dev/null` for graceful suppression, `|| echo "default"` for safe defaults
- **Path Resolution:** Consistent pattern for handling both repo names and direct paths

## Files Modified

| File | Change |
|------|--------|
| `scripts/utils/repo-scan.sh` | Created (141 lines) - 3 functions: scan_repo_git_status, scan_all_repos_status, check_repo_pr |
| `core/subagents/workflow-status-check.md` | Refactored (293→196 lines) - Now sources repo-scan.sh |
| `tests/repo-scan/test_repo_scan.sh` | Created - 9 unit tests |
| `tests/repo-scan/run_all.sh` | Created - Test runner |

## Lessons for Future Work

1. **Utility extraction works well:** Complex subagent logic can be extracted to bash utilities without breaking the subagent's functionality
2. **Documentation consolidation:** Verbose multi-table documentation can often be combined into single compact tables without losing clarity
3. **TDD for bash scripts:** The bash testing pattern (`assert_equals`, colored output) works well for utility scripts
