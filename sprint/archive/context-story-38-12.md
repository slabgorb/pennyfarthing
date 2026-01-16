# Story 38-10: Consolidate Duplicated Instructions - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 38 - Agent File Modernization |
| Points | 2 |
| Priority | P2 |
| Workflow | trivial |
| Repos | pennyfarthing |

## Problem Statement

Multiple agent files contain identical or near-identical content. This violates DRY (Don't Repeat Yourself) and creates maintenance burden - updates must be made in multiple places. The `shared-agent-behavior.md` guide exists specifically for common protocols but isn't being used for these patterns.

## Current Duplication

### 1. Turn Efficiency Section (12 files)

**Main agents (4):** sm.md, tea.md, dev.md, reviewer.md
**Subagents (8):** sm-handoff.md, sm-file-summary.md, generic-sm-setup.md, generic-sm-finish.md, generic-handoff.md, reviewer-preflight.md, workflow-status-check.md, testing-runner.md (implicit via `/dev-patterns` reference)

Each has a `## Turn Efficiency` section with agent-specific examples but common patterns:
- Parallelize file reads
- Batch bash commands
- Reference `/dev-patterns` skill

### 2. testing-runner Delegation Reminder (3 files)

**Identical block in:** sm.md:101-115, dev.md:70-84, reviewer.md:92-106

```markdown
⚠️ **REMINDER: Delegate ALL test runs to testing-runner subagent.**
Never run `just test`, `go test`, or `npm test` directly. Always spawn:
[yaml example block]
```

### 3. reasoning-mode Section

Already exists in shared-agent-behavior.md (L122-143) but agents have duplicate/variant copies.

## Technical Approach

### Step 1: Enhance shared-agent-behavior.md

Add two new sections:

**A. Turn Efficiency Protocol**
- Core principles (parallelize reads, batch commands)
- Reference to `/dev-patterns` skill
- Note that agents may add agent-specific examples

**B. Test Delegation Protocol**
- Warning about never running tests directly
- `testing-runner` subagent invocation template
- Full YAML example

### Step 2: Update Main Agent Files

For sm.md, dev.md, reviewer.md, tea.md:

**Remove:**
- Full Turn Efficiency section (keep only agent-specific examples if any)
- testing-runner reminder block

**Add:**
- Brief reference: "See shared-agent-behavior.md → Turn Efficiency"
- Brief reference: "See shared-agent-behavior.md → Test Delegation"

### Step 3: Update Subagent Files

For subagents with Turn Efficiency sections:
- Replace full section with reference to shared behavior
- Keep subagent-specific notes if any

## Files to Modify

| File | Action |
|------|--------|
| `pennyfarthing-dist/guides/shared-agent-behavior.md` | Add Turn Efficiency and Test Delegation sections |
| `pennyfarthing-dist/agents/sm.md` | Remove duplicates, add references |
| `pennyfarthing-dist/agents/tea.md` | Remove duplicates, add references |
| `pennyfarthing-dist/agents/dev.md` | Remove duplicates, add references |
| `pennyfarthing-dist/agents/reviewer.md` | Remove duplicates, add references |
| `pennyfarthing-dist/agents/sm-handoff.md` | Remove Turn Efficiency, add reference |
| `pennyfarthing-dist/agents/sm-file-summary.md` | Remove Turn Efficiency, add reference |
| `pennyfarthing-dist/agents/generic-sm-setup.md` | Remove Turn Efficiency, add reference |
| `pennyfarthing-dist/agents/generic-sm-finish.md` | Remove Turn Efficiency (2x), add reference |
| `pennyfarthing-dist/agents/generic-handoff.md` | Remove Turn Efficiency, add reference |
| `pennyfarthing-dist/agents/reviewer-preflight.md` | Remove Turn Efficiency, add reference |
| `pennyfarthing-dist/agents/workflow-status-check.md` | Remove Turn Efficiency, add reference |

## Acceptance Criteria

- [ ] Turn Efficiency section exists only in shared-agent-behavior.md
- [ ] testing-runner reminder exists only in shared-agent-behavior.md
- [ ] Agent files reference shared behavior instead of duplicating
- [ ] Agent-specific variations remain in agent files
- [ ] No functionality lost in consolidation

## Testing Strategy

1. Grep for `## Turn Efficiency` - should only match shared-agent-behavior.md
2. Grep for `REMINDER: Delegate ALL test runs` - should only match shared-agent-behavior.md
3. Verify all agent files have reference to shared behavior
4. Manual review to ensure agent-specific examples preserved where valuable

## Risk Mitigation

- Keep agent-specific examples inline where they add value (e.g., SM's subagent parallel spawning note)
- Don't over-consolidate - if content is truly agent-specific, keep it
- Test by reading agent files to ensure they still make sense standalone
