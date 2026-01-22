# Story BL-2: Add persona-config.local.yaml to init.ts updateGitignore()

## Summary

Added `.claude/persona-config.local.yaml` to the gitignore entries in the `updateGitignore()` function within `src/cli/commands/init.ts`. This ensures new Pennyfarthing installations correctly exclude user-local theme preferences from version control, completing the BL-1 feature for multi-developer theme isolation.

## Implementation Details

- **File Modified:** `src/cli/commands/init.ts`
- **Change:** Added `.claude/persona-config.local.yaml` to the gitignore entries array (line 422)
- **Scope:** Single line addition to existing entries array
- **Impact:** All new `pennyfarthing init` installations will now properly exclude local theme preferences

## Acceptance Criteria

- [x] updateGitignore() in init.ts includes persona-config.local.yaml
- [x] New pennyfarthing init installations have entry in .gitignore

## Testing & Verification

- TypeScript compilation: Successful
- Test suite: All 588 tests passing
- Code review: Approved without issues
- PR: https://github.com/1898andCo/pennyfarthing/pull/41

## Context

This story is a follow-up to BL-1 (Store theme preference in local settings). BL-1 implemented the ability to store theme preferences in user-local `.claude/persona-config.local.yaml` files so multiple developers can use different themes without committing to git. This story ensures that new installations correctly exclude that file from version control during initialization.

## Technical Notes

The change maintains consistency with existing gitignore patterns used for other local configuration files like `.claude/settings.local.json`.
