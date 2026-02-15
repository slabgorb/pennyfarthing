# Epic 107: Gate Validation & Authoring

**Jira:** MSSCI-15008
**Initiative:** gate-extraction
**Repos:** pennyfarthing

## Description

Gate schema validation at parse time, acyclic cycle detection, depth limit enforcement (max 3), and authoring guide with validation command. Catches errors before any subagent spawns.

## Stories

| ID | Title | Status | Workflow |
|----|-------|--------|----------|
| 107-1 | Gate schema validation at parse time | done | tdd |
| 107-2 | Acyclic validation and depth limit enforcement | done | tdd |
| 107-3 | Gate authoring guide and validation command | in-progress | agent-docs |

## Technical Context

### Completed Work (107-1, 107-2)

- **`packages/core/src/shared/gate-file-validation.ts`** — Parse-time validation for gate files:
  - Schema validation: every `<gate>` has `name`, `<purpose>`, `<pass>`, `<fail>`
  - Acyclic validation: DFS cycle detection on gate references
  - Depth limit enforcement: max nesting depth 3
  - All errors reported at once, not fail-fast
- Gate files live in `pennyfarthing-dist/` and are parsed before subagent execution
- Validation is pure-function, string-input, no I/O

### Story 107-3 Scope

- **Guide:** `pennyfarthing-dist/guides/gate-schema.md` — complete schema reference, working examples, authoring best practices
- **Validation command:** Checks schema + acyclic + depth + mandatory pass/fail, reports ALL errors, valid gates get structure summary confirmation
