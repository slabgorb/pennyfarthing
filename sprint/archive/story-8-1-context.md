# Story 8-1: Git Hook for PR Merge Detection - Technical Context

## Story Overview
- **Epic:** 8 - Automatic State Reconciliation
- **Points:** 3
- **Priority:** P1
- **Repos:** pennyfarthing

## Problem Statement

When PRs merge to develop/main outside the normal workflow (e.g., via GitHub UI, automated merge), the sprint YAML falls out of sync. Stories remain marked as "in-progress" or "in-review" even though the work is complete and merged. This creates drift between git reality and sprint tracking.

## Current State

**Existing Hook Infrastructure:**
- `.claude/settings.local.json` defines hooks (SessionStart, SessionEnd)
- Hook scripts live in `pennyfarthing-dist/scripts/hooks/`
- `session-start.sh` shows the pattern: find project root, parse input, update state
- `init.ts` merges hook configurations via `mergeSettingsLocalJson()`

**Sprint YAML Structure:**
- Stories have `status` field: backlog → in-progress → in-review → done
- Stories have optional `completed` field for completion date
- `sprint-common.sh` provides utilities: `find_story_file()`, `get_story_field()`

**Branch Naming Convention:**
- Feature branches: `feat/{story-id}-{description}` (e.g., `feat/8-1-merge-detection`)
- Story ID pattern: `{epic}-{story}` (e.g., `8-1`, `15-7`)

## Technical Approach

### 1. Create Post-Merge Git Hook

**File:** `pennyfarthing-dist/scripts/hooks/post-merge.sh`

```bash
#!/bin/bash
# Post-merge hook: Detect story ID from merged branch, update sprint YAML

# Find project root and source utilities
PROJECT_ROOT=$(...)
source "$PROJECT_ROOT/.claude/scripts/utils/sprint-common.sh"

# Get the branch that was just merged (from reflog or merge commit)
MERGED_BRANCH=$(git reflog -1 | grep -oP 'feat/\K[0-9]+-[0-9]+' | head -1)

# If story ID found, update sprint YAML
if [[ -n "$MERGED_BRANCH" ]]; then
  update_story_status "$MERGED_BRANCH" "done"
  log_reconciliation "$MERGED_BRANCH" "PR merged"
fi
```

### 2. Install Hook via Pennyfarthing Setup

**Option A: Git Hook (`.git/hooks/post-merge`)**
- Pros: Native git, runs automatically
- Cons: Not tracked in repo, must be installed per-clone

**Option B: Claude Code Hook (`settings.local.json`)**
- Pros: Already have infrastructure, tracked via pennyfarthing init
- Cons: Only runs during Claude sessions, not external merges

**Recommendation:** Implement both:
1. Git hook for external merges (installed during `pennyfarthing init`)
2. Claude Code hook for session-aware logging

### 3. Update sprint-common.sh

Add new function:
```bash
update_story_status() {
  local story_id="$1"
  local new_status="$2"
  local sprint_file=$(find_story_file "$story_id")

  # Use yq to update status and add completed date
  yq -i "... | select(.id == \"$story_id\").status = \"$new_status\"" "$sprint_file"
  yq -i "... | select(.id == \"$story_id\").completed = \"$(date +%Y-%m-%d)\"" "$sprint_file"
}
```

### 4. Logging

**File:** `.session/reconciliation.log`
```
2026-01-04T12:30:00Z | STORY: 8-1 | ACTION: status→done | TRIGGER: post-merge hook | BRANCH: feat/8-1-merge-detection
```

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `pennyfarthing-dist/scripts/hooks/post-merge.sh` | Create | Main hook script |
| `pennyfarthing-dist/scripts/utils/sprint-common.sh` | Modify | Add `update_story_status()` function |
| `src/cli/commands/init.ts` | Modify | Install git hook during init |
| `pennyfarthing-dist/templates/settings.local.json.template` | Modify | Add PostMerge hook entry |

## Acceptance Criteria

- [ ] Hook installed via `pennyfarthing init` (or `pennyfarthing doctor --fix`)
- [ ] Detects story ID from branch name pattern (feat/X-Y-*)
- [ ] Updates sprint YAML status to 'done' automatically
- [ ] Adds completed date field
- [ ] Logs reconciliation to `.session/`
- [ ] Works for merges that happen outside Claude workflow

## Testing Strategy

1. **Unit test:** Parse story ID from various branch formats
2. **Integration test:** Create test branch, merge, verify YAML updated
3. **Edge cases:** Branch without story ID, story not found in YAML, already-done story

## Dependencies & Risks

**Dependencies:**
- `yq` for YAML updates (already used elsewhere, fallback needed)
- Git reflog for branch detection

**Risks:**
- Branch name parsing edge cases (multiple story IDs, non-standard naming)
- Merge via rebase vs merge commit (different reflog patterns)
- Permission to write sprint YAML during hook execution

## Notes

This is the first story in Epic 8 (State Reconciliation). Story 8-2 (Startup Drift Detection) will complement this by catching any merges that happened while offline or before the hook was installed.
