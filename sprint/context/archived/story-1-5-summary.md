# Story 1-5: Add Epic Context Guardrail - Summary

**Completed:** 2025-12-22
**PR:** https://github.com/1898andCo/pennyfarthing/pull/2
**Jira:** MSSCI-11121

## What Was Built

Added a guardrail that validates epic technical context exists before allowing `/new-work` to proceed. This ensures users run `/start-epic` to generate strategic context before starting individual stories, enforcing the epic-first workflow pattern.

## Key Technical Decisions

1. **State Precedence:** MISSING_EPIC_CONTEXT takes precedence over NEW_WORK_STATE, ensuring the guardrail fires before story selection begins
2. **In-Progress Exception:** Work already in progress is not interrupted by missing epic context (let them finish current story)
3. **File Pattern:** Epic context detected via `.session/epic-*-context.md` glob pattern

## Implementation Patterns

- Added Step 1.5 to workflow-status-check.md (between session scan and git status)
- State determination rules applied in order with early exit
- Output format includes actionable user message with specific command to run

## Files Modified

| File | Change |
|------|--------|
| `core/subagents/workflow-status-check.md` | Added Step 1.5 epic context check, MISSING_EPIC_CONTEXT state, output table |
| `core/commands/new-work.md` | Updated diagram with MISSING_EPIC_CONTEXT branch |
| `.claude/guides` | Created symlink to core/guides (dogfooding infrastructure) |
| `README.md` | Documented guides symlink |
| `scripts/check-context.sh` | Added context monitoring script |
| `scripts/init-project.sh` | Updated to symlink pennyfarthing scripts to consumers |

## Lessons for Future Work

1. **Dogfooding reveals gaps:** Running pennyfarthing on itself surfaced the missing guides symlink and check-context.sh script
2. **Guardrails should be additive:** The implementation adds a check without breaking existing flows
3. **Documentation-as-code:** Subagent prompts are effectively code and benefit from the same review rigor
