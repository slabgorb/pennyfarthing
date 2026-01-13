# Story 31-7: Generic Workflow-Driven Handoff Subagent - Technical Context

## Story Overview
| Field | Value |
|-------|-------|
| Epic | 31 - Customizable Workflow Engine |
| Points | 5 |
| Priority | high |
| Jira | MSSCI-11624 |
| Repos | pennyfarthing |
| Dependencies | 31-3 (done), 31-6 (done) |

## Problem Statement
Currently we have 5 separate handoff subagents with duplicated logic:
- `tea-handoff.md` - validates RED tests, transitions tea→dev
- `dev-handoff.md` - validates GREEN tests + quality gates + PR, transitions dev→review
- `sm-handoff.md` - validates setup complete, transitions sm→tea/dev
- `reviewer-handoff-approve.md` - validates approval, transitions review→approved
- `reviewer-handoff-reject.md` - validates rejection, loops review→dev

Each hardcodes its gate checks and next-phase routing. This makes adding new workflows or phases require creating new handoff files.

## Solution
Single `generic-handoff.md` subagent that:
1. Reads current phase from session file's `## Workflow Tracking` section
2. Loads workflow definition from `.claude/workflows/{workflow-name}.yaml`
3. Looks up gate requirements for current phase
4. Runs appropriate checks based on gate type
5. Determines next phase from workflow definition
6. Updates session file with phase transition

## Current State Analysis

### Session File Workflow Tracking Format
From existing handoff files, the session file contains:
```markdown
## Workflow Tracking
| Field | Value |
|-------|-------|
| workflow | tdd |
| phase | dev |
| phase_started | 2026-01-13T10:00:00 |

### Phase History
| Phase | Started | Completed | Duration | Notes |
|-------|---------|-----------|----------|-------|
| sm | 2026-01-13T09:00:00 | 2026-01-13T09:30:00 | 30m | Setup complete |
| tea | 2026-01-13T09:30:00 | 2026-01-13T10:00:00 | 30m | RED tests written |
```

### Gate Types (from acceptance criteria)
| Gate Type | Check Required | Used By |
|-----------|----------------|---------|
| `tests_pass` | Run tests, verify GREEN | dev-handoff |
| `tests_fail` | Run tests, verify RED | tea-handoff |
| `approval` | Check PR approved or assessment shows APPROVED | reviewer-handoff-approve |
| `rejection` | Check assessment shows REJECTED, route back | reviewer-handoff-reject |
| `manual` | No automated check, just verify section exists | sm-handoff |

### Workflow Definition Structure (Expected)
```yaml
# .claude/workflows/tdd.yaml
name: tdd
phases:
  - name: sm
    gate: manual
    next: tea  # or dev for 1-2 pt stories
  - name: tea
    gate: tests_fail
    next: dev
  - name: dev
    gate: tests_pass
    next: review
  - name: review
    gate: approval
    next: approved
    reject_to: dev  # for rejection loop-back
  - name: approved
    gate: manual
    next: null  # terminal
```

## Files to Modify/Create

### Create
| File | Purpose |
|------|---------|
| `pennyfarthing-dist/agents/generic-handoff.md` | The unified handoff subagent |
| `pennyfarthing-dist/workflows/tdd.yaml` | TDD workflow definition (if not exists) |

### Modify
| File | Change |
|------|--------|
| `pennyfarthing-dist/agents/workflow-status-check.md` | Read workflow state from workflow YAML |

### Deprecate (after validation)
| File | Reason |
|------|--------|
| `pennyfarthing-dist/agents/tea-handoff.md` | Replaced by generic-handoff |
| `pennyfarthing-dist/agents/dev-handoff.md` | Replaced by generic-handoff |
| `pennyfarthing-dist/agents/sm-handoff.md` | Replaced by generic-handoff |
| `pennyfarthing-dist/agents/reviewer-handoff-approve.md` | Replaced by generic-handoff |
| `pennyfarthing-dist/agents/reviewer-handoff-reject.md` | Replaced by generic-handoff |

## Technical Approach

### Phase 1: Generic Handoff Core
1. Parse session file to extract workflow name and current phase
2. Load workflow definition YAML
3. Look up current phase's gate type and next phase
4. Dispatch to gate-specific check function

### Phase 2: Gate Check Functions
```
gate_check_tests_pass():
  - Spawn testing-runner subagent
  - Verify all tests pass (GREEN)
  - Fail handoff if tests fail

gate_check_tests_fail():
  - Spawn testing-runner subagent
  - Verify tests fail (RED)
  - Fail handoff if tests pass

gate_check_approval():
  - Read session file for Reviewer Assessment
  - Check verdict is APPROVED
  - Fail handoff if not approved

gate_check_rejection():
  - Read session file for Reviewer Assessment
  - Check verdict is REJECTED
  - Return reject_to phase instead of next phase

gate_check_manual():
  - Verify expected assessment section exists
  - No automated validation
```

### Phase 3: Phase Transition
1. Calculate duration from phase_started
2. Update Phase History table with completed phase
3. Update Workflow Tracking with new phase and timestamp
4. Report next agent based on phase name

### Backward Compatibility
- Existing session files with workflow=tdd work unchanged
- Gate types map exactly to current hardcoded behavior
- Phase names unchanged (sm, tea, dev, review, approved)
- Agent guidance unchanged

## Acceptance Criteria
- [ ] AC1: Single generic-handoff.md replaces 5 specific handoff files
- [ ] AC2: Reads gate type from workflow (tests_pass, tests_fail, approval, manual)
- [ ] AC3: Runs gate-specific checks (test runner for tests_*, PR check for approval)
- [ ] AC4: Updates session file workflow section with phase transition
- [ ] AC5: Determines next agent from workflow phases array
- [ ] AC6: Backward compatible with existing TDD flow
- [ ] AC7: Unit tests for handoff logic
- [ ] AC8: Records phase transitions with timestamps
- [ ] AC9: workflow-status-check reads workflow state

## Testing Strategy

### Unit Tests
- Parse workflow YAML correctly
- Each gate type runs correct checks
- Phase transition updates session file correctly
- Rejection routes to reject_to phase
- Missing workflow file handled gracefully
- Invalid phase handled gracefully

### Integration Tests
- Full TDD flow with generic-handoff works end-to-end
- Existing session files work unchanged
- Phase history accumulates correctly through flow

## Dependencies & Risks

### Dependencies
- Story 31-3 (workflow definition format) - DONE
- Story 31-6 (workflow-status-check updates) - DONE

### Risks
| Risk | Mitigation |
|------|------------|
| Breaking existing flows | Keep old handoff files until validated |
| Gate check regressions | Test each gate type explicitly |
| Session file format changes | Use same format as existing handoffs |

## Notes for TEA
- Focus tests on gate dispatch logic - each gate type should route to correct check
- Test phase transition including duration calculation
- Test rejection loop-back (review→dev instead of review→approved)
- Mock testing-runner for test gate checks
