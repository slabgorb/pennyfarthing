# Story 31-10: Activate workflow-driven handoffs - Summary

## What Was Built

Activated the workflow-driven handoff system, replacing 5 hardcoded handoff subagents with a single generic-handoff that reads phase requirements from YAML workflow definitions. Main agents (TEA, Dev, Reviewer) now use `generic-handoff` subagent_type with workflow phase context instead of specific handoffs.

## Key Technical Decisions

1. **Self-contained markdown for Haiku** - `generic-handoff.md` contains all logic inline since Haiku can't import TypeScript. Uses CLI wrapper to access the TypeScript implementation.

2. **CLI wrapper pattern** - Shell script → Node.js → TypeScript chain (`generic-handoff-cli.sh` → `generic-handoff-cli.js` → `packages/core/dist/workflow/generic-handoff.js`). Consistent with existing project patterns.

3. **Deprecation over deletion** - Old handoff files remain in `pennyfarthing-dist/agents/` but marked deprecated in README. Allows gradual transition and fallback.

4. **Workflow detection from session** - Agents grep `**Workflow:**` from session file before spawning handoff, passing workflow name as parameter. No hardcoded assumptions.

## Implementation Patterns

- **Gate-type routing** - Generic handoff checks gate type (tests_fail, tests_pass, approval, manual) and runs appropriate verification
- **Rejection loop-back** - On rejection, handoff finds previous `tests_pass` gate phase for Dev to fix
- **Test cache integration** - Reuses Story 31-8 cache to avoid redundant test runs during handoff

## Files Modified

| File | Change |
|------|--------|
| `pennyfarthing-dist/agents/generic-handoff.md` | NEW - 385 lines, self-contained handoff subagent |
| `pennyfarthing-dist/agents/tea.md` | Updated handoff section for generic-handoff |
| `pennyfarthing-dist/agents/dev.md` | Updated handoff section for generic-handoff |
| `pennyfarthing-dist/agents/reviewer.md` | Updated handoff section for generic-handoff |
| `pennyfarthing-dist/agents/README.md` | Deprecation notice for old handoffs |
| `scripts/generic-handoff-cli.js` | NEW - 186 lines, CLI wrapper |
| `scripts/generic-handoff-cli.sh` | NEW - Shell wrapper |

## Lessons for Future Work

1. **Markdown subagents need CLI bridges** - When TypeScript logic exists but Haiku needs it, create a CLI wrapper rather than duplicating logic in markdown.

2. **Deprecation workflow works** - Marking files deprecated in README while keeping them for backward compatibility is practical approach.

3. **Workflow YAML is the source of truth** - All phase logic now driven by `pennyfarthing-dist/workflows/*.yaml`. Adding new workflows just requires YAML, no code changes.

4. **Test the CLI directly** - Quick verification via `./scripts/generic-handoff-cli.sh find-phase --workflow tdd --phase green` catches issues faster than spawning full subagent.

---
*Story completed: 2026-01-14 | Epic 31: Customizable Workflow Engine (story 10 of 10)*
