# Story 2-1: Automate Jira sync in SM finish workflow - Technical Context

## Story Overview
- **Epic:** 2 - Sprint Operations Polish
- **Points:** 3
- **Priority:** P1
- **Repos:** pennyfarthing
- **Route:** SM → TEA → Dev → Reviewer

## Current State

The SM finish workflow (`sm-finish-execution.md`) has a minimal Jira integration at Step 4:

```bash
# Current implementation (Step 4, lines 64-70)
jira issue move {JIRA_KEY} "Done" 2>/dev/null
```

This is fragile because:
- No error handling (just suppresses stderr)
- Doesn't sync story points to Jira
- Doesn't add completion comments
- Doesn't use the robust `jira-lib.sh` utilities

Meanwhile, we have robust infrastructure that's not being used:
- `scripts/utils/jira-lib.sh` - 13+ functions for all Jira operations
- `scripts/utils/jira-sync-story.sh` - Orchestrates story sync with `--transition --points` flags

## Technical Approach

**Replace inline `jira issue move` with `jira-sync-story.sh` call:**

```bash
# New implementation for Step 4
./scripts/run.sh jira-sync-story.sh "{STORY_ID}" --transition --points 2>/dev/null || true
```

This will automatically:
1. Map Conductor status (`done`) to Jira status (`Done`)
2. Sync story points to custom field
3. Add auto-comment: "Story completed via Pennyfarthing finish workflow"
4. Handle errors gracefully (Jira down shouldn't block finish)

**Key Design Decision:** Use `|| true` to ensure Jira failures don't block story completion. Log the error but proceed.

## Files to Modify

| File | Change |
|------|--------|
| `.claude/subagents/sm-finish-execution.md` | Replace Step 4 Jira call with jira-sync-story.sh |
| `scripts/utils/jira-sync-story.sh` | Add `--auto-comment` flag for finish workflow |
| `core/subagents/sm-finish-execution.md` | Mirror changes to core/ |
| `assets/core/subagents/sm-finish-execution.md` | Mirror changes to assets/ |

## Acceptance Criteria
- [ ] SM finish workflow automatically transitions Jira to Done
- [ ] Jira errors are logged but don't block story completion
- [ ] Works with or without Jira configured

## Testing Strategy

1. **Unit tests:** Test jira-sync-story.sh with mocked Jira CLI
2. **Integration test:** Run finish workflow on a test story with Jira
3. **Failure test:** Verify workflow completes when Jira is unavailable

## Dependencies & Risks

**Dependencies:**
- `jira-lib.sh` exists and is functional ✓
- `jira-sync-story.sh` exists and works ✓
- Jira CLI configured in environment (optional)

**Risks:**
- **Low:** Jira CLI not installed - handled by `check_jira_cli()` function
- **Low:** API token expired - graceful failure with `|| true`

## Implementation Notes

The `jira-sync-story.sh` script already:
- Sources `jira-lib.sh` for all operations
- Maps status via `map_status_to_jira()`
- Supports `--transition` and `--points` flags
- Has `DRY_RUN` mode for testing

We may need to add:
- `--quiet` flag to suppress non-error output
- Better exit code handling for "not configured" vs "error" cases

## Reference Files

```
.claude/subagents/sm-finish-execution.md  # Primary target
scripts/utils/jira-lib.sh                  # Utility library
scripts/utils/jira-sync-story.sh           # Orchestration script
core/commands/sync-epic-to-jira.md         # Documentation reference
```
