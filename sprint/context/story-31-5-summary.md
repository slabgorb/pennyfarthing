# Story 31-5: /workflow skill for listing and switching

**Epic:** 31 - Customizable Workflow Engine
**Points:** 2 | **Completed:** 2026-01-13
**PR:** #217

## What Was Built

Created the `/workflow` skill for managing workflows in Pennyfarthing:
- `/workflow` - Lists all available workflows (tdd, trivial)
- `/workflow show` - Displays current workflow and phase from session
- `/workflow show <name>` - Shows specific workflow details
- `/workflow set <name>` - Switches active workflow mid-session

## Files Changed

| File | Change |
|------|--------|
| `pennyfarthing-dist/skills/workflow/SKILL.md` | New skill (160 lines) |
| `.claude/skills/workflow` | Symlink to skill |

## Key Decisions

1. **Skill-only implementation** - No TypeScript needed; skill wraps existing loader/router with zsh commands
2. **Session-aware** - Reads current phase from session file, defaults to tdd if no workflow field
3. **Manual set** - Workflow switching is documented procedure, not automated command

## Patterns Established

- Workflow listing uses `for` loop over `pennyfarthing-dist/workflows/*.yaml`
- Phase extraction via `grep` patterns matching session file format
- Default workflow handling: `${WORKFLOW:-tdd (default)}`

## Lessons for Future Work

1. **zsh compatibility** - User requested zsh syntax; use `[[ ]]` and zsh-specific constructs
2. **Foundation for 31-6** - Session file doesn't have `workflow:` field yet; this skill anticipates it
3. **Skill symlinks** - Must create both the skill file AND the symlink in `.claude/skills/`
