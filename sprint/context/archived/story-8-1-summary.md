# Story 8-1: Git Hook for PR Merge Detection - Summary

**Epic:** 8 - Automatic State Reconciliation
**Points:** 3 | **Priority:** P1
**Completed:** 2026-01-11 (test fix merged; implementation completed 2026-01-04)

## What Was Built

Implemented a post-merge git hook that automatically detects when feature branches are merged and updates the sprint YAML status to 'done'. The hook works independently of Claude sessions, allowing merges that happen via GitHub web UI or manual git commands to still trigger sprint reconciliation.

## Key Technical Decisions

1. **Dual-shell compatibility** - Used `${match[1]:-${BASH_REMATCH[1]}}` pattern in sprint-common.sh to handle both bash and zsh regex capture groups, since the file may be sourced from either shell.

2. **Strict input validation** - Branch names are validated with regex `^feat/([0-9]+-[0-9]+)` to ensure only digit-hyphen patterns are extracted, eliminating shell injection risks.

3. **Graceful degradation** - Hook silently exits for non-pennyfarthing projects and warns (without failing) when yq is unavailable.

4. **Hook installation via init** - Added `installGitHooks()` function to init.ts that copies the hook to `.git/hooks/post-merge` with proper permissions (0o755) and backs up existing hooks.

## Implementation Patterns

- **Find project root pattern**: Walk up directory tree looking for `.claude/` marker
- **yq for YAML manipulation**: Safe, idempotent updates to sprint YAML
- **Reconciliation logging**: Append-only log to `.session/reconciliation.log` for debugging

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/scripts/hooks/post-merge.sh` | New (166 lines) - Git hook implementation |
| `pennyfarthing-dist/scripts/utils/sprint-common.sh` | Added 73 lines - extract_story_id(), update_story_status(), log_reconciliation() |
| `packages/core/src/cli/commands/init.ts` | Added 64 lines - installGitHooks() function |
| `dist/cli/commands/init.js` | Compiled output |

## Lessons for Future Work

1. When sourcing shell files across bash/zsh, the shebang is ignored - the sourcing shell interprets the code, so compatibility patterns are essential.

2. For yq operations, success exit code doesn't mean the target was found - consider adding verification when precise feedback is needed.

3. The 5-minute window for detecting merges via `git log --since` is arbitrary but works for typical workflows. Edge cases with long merge operations may miss detection.

4. **2026-01-11 Note:** Story was already implemented but left in backlog. Test file had stale path (`src/cli/` instead of `packages/core/src/cli/`) after monorepo restructure. Fixed test path, all 12 tests now pass.
