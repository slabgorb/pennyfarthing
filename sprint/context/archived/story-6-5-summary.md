# Story 6-5: Add version tracking and compatibility warnings

## Summary

Implemented version tracking system for custom themes to warn users when themes may be outdated. Custom themes now include `pennyfarthing_version` metadata, and `agent-session.sh` compares it with the current VERSION file, displaying a compatibility warning on major/minor version mismatch.

## Implementation

### Changes Made

1. **Updated agent-session.sh**:
   - Added `check_theme_version()` function (17 lines)
   - Updated theme lookup order to prioritize `.claude/pennyfarthing/themes/` (custom themes) before built-in themes
   - Reads `pennyfarthing_version` from theme YAML using yq
   - Compares only major.minor versions (ignores patch versions)
   - Displays warning to stderr without blocking theme loading
   - Graceful error handling for missing files or yq failures

2. **Updated theme-maker.md**:
   - Changed hardcoded `pennyfarthing_version: "3.6.1"` to dynamic VERSION file reference
   - Now writes actual current version when creating new themes

### Version Comparison Logic

- Extracts major.minor from semver strings: `cut -d. -f1,2`
- Example: "3.7.1" becomes "3.7"
- Only warns if major/minor differs
- Patch versions ignored (3.7.0 vs 3.7.5 = no warning)

### Warning Format

```
Warning: Theme 'my-theme' was created with Pennyfarthing 3.2.0
         Current version: 3.5.3 - agent roles may have changed.
         Run '/theme-maker --update my-theme' to review.
```

## Testing

All acceptance criteria verified:
- Custom themes include version metadata
- agent-session.sh detects version mismatch
- Warning displayed but doesn't block usage
- Warning only on major/minor mismatch (not patch)

Manual verification passed all 4 scenarios:
1. Built-in theme (no version) - no warning
2. Custom theme with matching version - no warning
3. Custom theme with patch difference - no warning
4. Custom theme with minor difference - WARNING shown

## PR Details

- **PR #25**: feat(6-5): Add version tracking and compatibility warnings
- **Branch**: feat/6-5-version-tracking
- **Repository**: pennyfarthing
- **Jira**: MSSCI-11201

## Files Changed

- `pennyfarthing-dist/scripts/agent-session.sh`
- `pennyfarthing-dist/commands/theme-maker.md`

## Workflow Status

- SM (Setup): COMPLETE
- TEA (RED): SKIPPED (2-point story)
- Dev (GREEN): COMPLETE
- Reviewer (Code Review): APPROVED
- SM (Finish): COMPLETE
