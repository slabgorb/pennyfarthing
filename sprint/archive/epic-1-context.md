# Epic 1: Agentic Best Practices Implementation - Technical Context

**Generated:** 2025-12-22
**Epic Points:** 23
**Stories:** 5

---

## Epic Overview

Implement Anthropic's agentic best practices patterns into Pennyfarthing. Phase 1 (sidecars, permissions, hooks) is complete. This epic covers the remaining work: documentation, resilience, and optimization.

---

## Current State Analysis

### Command Files (Story 1-1)
All 10 agent command files are minimal 16-line stubs:
- `core/commands/dev.md` (16 lines)
- `core/commands/tea.md` (16 lines)
- `core/commands/reviewer.md` (16 lines)
- `core/commands/sm.md` (16 lines)
- `core/commands/pm.md` (16 lines)
- `core/commands/architect.md` (16 lines)
- `core/commands/orchestrator.md` (16 lines)
- `core/commands/devops.md` (16 lines)
- `core/commands/tech-writer.md` (16 lines)
- `core/commands/ux-designer.md` (16 lines)

**Template to follow:** `core/commands/new-work.md` (95 lines) with:
- YAML frontmatter
- Workflow diagram (ASCII)
- Usage examples
- Reference links

### Strategic Agent Behavior Guide (Story 1-2)
`core/guides/strategic-agent-behavior.md` exists (181 lines) but needs:
- PM ↔ Architect coordination patterns
- Approval gates and escalation rules
- Sprint planning workflows

### Resilience Infrastructure (Story 1-3)
**No dedicated utilities exist yet.** Error recovery patterns are embedded in 6+ subagents using "Log→Diagnose→Adjust→Escalate" pattern but not extracted.

Existing scripts:
- `scripts/agent-session.sh` (163 lines) - session management
- `scripts/repo-utils.sh` (548 lines) - multi-repo support
- `scripts/worktree-manager.sh` (395 lines) - parallel work

### Large Subagents (Story 1-4)
| Subagent | Lines | Optimization Opportunity |
|----------|-------|--------------------------|
| testing-runner.md | 361 | Extract test container setup |
| workflow-status-check.md | 255 | Extract repo scanning utilities |

No structured logging exists - only markdown tables and plain text via `tee`.

### Guardrail Gap (Story 1-5)
Currently no validation that `/start-epic` has been run before `/new-work`. The workflow-status-check subagent should verify epic context exists.

---

## Stories Summary

| ID | Title | Points | Priority | Type |
|----|-------|--------|----------|------|
| 1-1 | Expand agent command files | 5 | P1 | Documentation |
| 1-2 | Complete strategic agent behavior guide | 3 | P1 | Documentation |
| 1-3 | Add resilience utilities | 5 | P1 | Infrastructure |
| 1-4 | Optimize subagents & logging | 8 | P2 | Optimization |
| 1-5 | Add epic context guardrail | 2 | P1 | Guardrail |

---

## Files to Modify

### Story 1-1: Command Files
- `core/commands/dev.md` → expand to ~80-100 lines
- `core/commands/tea.md` → expand to ~80-100 lines
- `core/commands/reviewer.md` → expand to ~80-100 lines
- `core/commands/sm.md` → expand to ~80-100 lines
- `core/commands/pm.md` → expand to ~80-100 lines
- `core/commands/architect.md` → expand to ~80-100 lines
- `core/commands/orchestrator.md` → expand to ~80-100 lines
- `core/commands/devops.md` → expand to ~80-100 lines
- `core/commands/tech-writer.md` → expand to ~80-100 lines
- `core/commands/ux-designer.md` → expand to ~80-100 lines

### Story 1-2: Guide Enhancement
- `core/guides/strategic-agent-behavior.md` → add ~50-80 lines

### Story 1-3: New Utilities
- `scripts/utils/retry.sh` → new file (~50 lines)
- `scripts/utils/checkpoint.sh` → new file (~80 lines)
- `scripts/check-context.sh` → enhance with warnings

### Story 1-4: Optimization
- `core/subagents/testing-runner.md` → split or refactor
- `core/subagents/workflow-status-check.md` → extract utilities
- `scripts/utils/logging.sh` → new file (~60 lines)

### Story 1-5: Guardrail
- `core/subagents/workflow-status-check.md` → add epic context check
- `core/commands/new-work.md` → add validation step

---

## Technical Approach

### Story 1-1 Approach
1. Read `new-work.md` as template
2. For each command file:
   - Add workflow diagram showing agent's position in TDD flow
   - Add usage examples with common invocations
   - Add reference links to agent file and subagents
   - Maintain consistent structure across all 10

### Story 1-2 Approach
1. Read current guide content
2. Add sections for:
   - PM requests architecture review → Architect responds
   - Approval gates (when to escalate vs proceed)
   - Sprint planning ceremony flow

### Story 1-3 Approach
1. Extract retry pattern from subagents into `retry.sh`
2. Create checkpoint functions for session state
3. Add context percentage check to `check-context.sh`

### Story 1-4 Approach
1. Identify extraction candidates in large subagents
2. Create utility functions in `scripts/utils/`
3. Add JSON logging option alongside markdown

### Story 1-5 Approach
1. Add check in workflow-status-check for `.session/epic-*-context.md`
2. Return `MISSING_EPIC_CONTEXT` state if not found
3. Update new-work.md to handle this state

---

## Testing Strategy

- **Story 1-1:** Manual review - verify each command file has consistent structure
- **Story 1-2:** Manual review - verify guide covers all coordination patterns
- **Story 1-3:** Shell script tests - verify retry logic, checkpoint save/restore
- **Story 1-4:** Line count verification, logging output format tests
- **Story 1-5:** Test /new-work without epic context, verify error message

---

## Dependencies & Risks

**Dependencies:**
- Story 1-5 depends on Story 1-4 (workflow-status-check modifications)
- Story 1-3 utilities may be used by Story 1-4

**Risks:**
- Command file expansion (1-1) is repetitive - risk of inconsistency
- Subagent splitting (1-4) may break existing workflows

**Mitigations:**
- Use strict template for 1-1
- Test workflow after 1-4 changes

---

## Recommended Story Order

1. **Story 1-5** (2 pts) - Quick guardrail, prevents future issues
2. **Story 1-1** (5 pts) - Foundation for all agent invocations
3. **Story 1-2** (3 pts) - Strategic coordination patterns
4. **Story 1-3** (5 pts) - Resilience infrastructure
5. **Story 1-4** (8 pts) - Optimization (can be deferred if needed)

---

*Context generated by SM (Captain Carrot)*
