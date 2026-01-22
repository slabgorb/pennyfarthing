# Story 4-6 Summary: Isolate Pennyfarthing Scripts from /scripts Directory

## Overview
Resolved architectural issue where Pennyfarthing squatted on the project root `/scripts/` directory, preventing end users from using this common directory name for their own project scripts.

## What Changed
1. **Namespaced all script references** to `.claude/pennyfarthing/scripts/`
2. **Updated hooks** in settings template to use full paths instead of symlinks
3. **Removed symlink creation** from `init.ts` - fresh installs no longer create `/scripts` symlink
4. **Added migration** in `update.ts` - existing installs gracefully clean up legacy symlinks

## Implementation Details

### Files Modified

**CLI Source Changes:**
- `src/cli/commands/init.ts` - Removed symlink creation line (line 165 deleted)
- `src/cli/commands/update.ts` - Added migration logic to clean legacy symlinks

**Template & Script Changes:**
- `pennyfarthing-dist/templates/settings.local.json.template` - Hook path updated to `.claude/pennyfarthing/scripts/hooks/session-start.sh`
- `pennyfarthing-dist/scripts/run.sh` - Script lookup path changed from `$PROJECT_ROOT/scripts/` to `$PROJECT_ROOT/.claude/pennyfarthing/scripts/`

### Acceptance Criteria
All 5 acceptance criteria completed:
- AC1: Hooks reference .claude/pennyfarthing/scripts/ instead of /scripts/ ✓
- AC2: Settings template uses namespaced script paths ✓
- AC3: pennyfarthing update removes legacy /scripts symlinks ✓
- AC4: End users can use /scripts/ for their own project scripts ✓
- AC5: Existing functionality preserved (run.sh works correctly) ✓

## Testing
- 7 comprehensive tests in `tests/resilience/test_script_isolation.sh`
- All tests passing (GREEN phase complete)
- Test coverage includes all 5 acceptance criteria

## Review & Approval
- **PR:** #21 (merged to develop)
- **Verdict:** APPROVED by Reviewer
- **Code Review:** Migration code safety verified, path consistency confirmed

## Impact
- End users can now freely use `/scripts/` directory for their own project scripts
- Existing Pennyfarthing installations continue to function after update
- Fresh installs don't create unnecessary symlinks
- Zero user-facing behavior changes (only removal of squatting symlink)

## Story Points
3 points (P1 priority)

## Artifacts
- Branch: feat/4-6-isolate-scripts
- PR: https://github.com/1898andCo/pennyfarthing/pull/21
- Tests: `tests/resilience/test_script_isolation.sh`
- Commit: 2fa7c65 feat(4-6): isolate Pennyfarthing scripts from /scripts directory
