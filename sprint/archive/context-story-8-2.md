# Story 8-2: Startup Drift Detection - Technical Context

## Story Overview
- **Epic:** 8 - Automatic State Reconciliation
- **Points:** 3
- **Priority:** P1
- **Repos:** pennyfarthing
- **Jira:** MSSCI-11510

## Problem Statement

When an agent activates, it reads sprint YAML as source of truth. But if a PR was merged outside the workflow (via GitHub web UI, another developer, etc.), the YAML may show `status: in_progress` while git shows the branch already merged. This causes:
- Offering work that's already done
- Duplicate implementation attempts
- Confused workflow state

Story 8-1 solved the *reactive* case: post-merge hook updates YAML when you do a `git pull`. Story 8-2 solves the *proactive* case: detecting drift at agent startup before any work begins.

## Current State

### What's Working (from 8-1)
- `post-merge.sh` hook detects merges and updates YAML
- `sprint-common.sh` provides `extract_story_id()` and `update_story_status()`
- `workflow-status-check.md` determines workflow state (NEW_WORK, IN_PROGRESS, FINISH)
- Reconciliation events logged to `.session/reconciliation.log`

### What's Missing
- No drift detection at agent activation
- If hook didn't run (e.g., merge via GitHub web UI without pull), YAML stays stale
- `workflow-status-check` doesn't compare git state against YAML

## Technical Approach

### New Function: `detect_drift()` in sprint-common.sh

Add a function that:
1. Scans recent merge commits to develop/main (past 7 days)
2. Extracts story IDs from merged branch names (`feat/X-Y-*`)
3. Compares against stories with `status: in_progress` in YAML
4. Returns list of drifted stories

```bash
detect_drift() {
    local drifted=()

    # Get recently merged branches (past 7 days)
    local merged_branches=$(git log --merges --oneline --since="7 days ago" develop 2>/dev/null | \
        grep -oE 'feat/[0-9]+-[0-9]+' | sort -u)

    for branch in $merged_branches; do
        local story_id=$(extract_story_id "$branch")
        if [[ -n "$story_id" ]]; then
            local yaml_status=$(get_story_field "$story_id" "status")
            if [[ "$yaml_status" != "done" && "$yaml_status" != "backlog" ]]; then
                drifted+=("$story_id:$yaml_status")
            fi
        fi
    done

    printf '%s\n' "${drifted[@]}"
}
```

### Integration: workflow-status-check.md Step 2.5

Insert drift detection between git scan (Step 2) and state determination (Step 3):

```markdown
## Step 2.5: Detect Drift

Run drift detection to find stories that are merged but not marked done:

\`\`\`bash
source "$PROJECT_ROOT/pennyfarthing-dist/scripts/utils/sprint-common.sh"
drifted=$(detect_drift)
\`\`\`

If drift found, report before state determination:
- List drifted stories with their current YAML status
- Offer auto-reconcile option
- Log drift detection to reconciliation.log
```

### Auto-Reconcile Flow

When drift detected:
1. Report: "Story X-Y shows 'in_progress' but branch already merged"
2. Ask: "Auto-reconcile? (y/n)"
3. If yes: Call `update_story_status "$story_id" "done"`
4. Log: `log_reconciliation "$story_id" "Auto-reconciled from drift detection"`

## Files to Modify

| File | Change |
|------|--------|
| `pennyfarthing-dist/scripts/utils/sprint-common.sh` | Add `detect_drift()` function (~20 lines) |
| `pennyfarthing-dist/agents/workflow-status-check.md` | Add Step 2.5 for drift detection |
| `pennyfarthing-dist/scripts/tests/test-drift-detection.sh` | New test suite |

## Acceptance Criteria

- [ ] AC1: `workflow-status-check` detects merged-but-not-closed stories
- [ ] AC2: Clear report of drifted stories shown to user
- [ ] AC3: Option to auto-reconcile (update YAML to done)

## Testing Strategy

### Unit Tests (test-drift-detection.sh)
1. `detect_drift()` returns empty when no drift
2. `detect_drift()` finds story merged but marked in_progress
3. `detect_drift()` ignores stories already marked done
4. `detect_drift()` handles stories marked backlog (not drift)
5. Auto-reconcile updates YAML correctly
6. Reconciliation logged to `.session/reconciliation.log`

### Integration Tests
1. Full workflow: merge branch → activate agent → drift detected
2. Multiple drifted stories reported correctly
3. Edge case: story in archive (already completed in prior sprint)

## Dependencies & Risks

### Dependencies
- `yq` for YAML parsing (already required)
- `git log --merges` for merge detection
- Existing `sprint-common.sh` functions

### Risks
1. **Race conditions** - Multiple sessions detecting same drift
   - Mitigation: File locking via checkpoint.sh patterns

2. **False positives** - Branch name doesn't match feat/X-Y pattern
   - Mitigation: Only check branches matching pattern

3. **Performance** - Scanning git log on every activation
   - Mitigation: 7-day window, typically <100 commits

## Patterns to Follow

From post-merge.sh (8-1):
- Story ID extraction: `extract_story_id()` at L108-121 of sprint-common.sh
- Status update: `update_story_status()` at L123-158
- Logging: `log_reconciliation()` at L160-179

## Key Lines of Interest

- `sprint-common.sh:108-121` - extract_story_id regex pattern
- `sprint-common.sh:57-83` - get_story_field for YAML reads
- `sprint-common.sh:123-158` - update_story_status for reconciliation
- `workflow-status-check.md:113-137` - State determination logic (insert Step 2.5 before this)
