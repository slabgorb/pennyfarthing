# Story 31-16: Enforce handoff subagent spawning for all agents

## Overview

Bug discovered during 31-14: Agents write assessments to session file but skip spawning the generic-handoff subagent. This has happened multiple times - both Reviewer and Dev missed handoffs.

The problem is that handoff is documented but not enforced. Agents complete their work, write to session, and stop - forgetting the handoff step.

## Technical Approach

Three-pronged enforcement:

### 1. Modify agent-session.sh stop command
- Before stopping, check if session file has handoff entry for current phase
- If assessment exists but no handoff, warn and refuse to stop cleanly
- Exit non-zero to signal incomplete handoff

### 2. Add explicit handoff gates to each agent .md file
- Add a MUST-DO checklist item: "Spawned generic-handoff subagent"
- Make it impossible to miss - right after assessment template
- Clear warning: "DO NOT proceed to agent-session.sh stop without handoff"

### 3. Consider combining assessment + handoff
- Single subagent that writes assessment AND triggers handoff
- Eliminates the gap where agent forgets step 2
- May be overkill - evaluate during implementation

## Files to Modify

| File | Change |
|------|--------|
| `.claude/scripts/agent-session.sh` | Add handoff validation in stop command |
| `pennyfarthing-dist/agents/sm.md` | Add explicit handoff gate checklist |
| `pennyfarthing-dist/agents/tea.md` | Add explicit handoff gate checklist |
| `pennyfarthing-dist/agents/dev.md` | Add explicit handoff gate checklist |
| `pennyfarthing-dist/agents/reviewer.md` | Add explicit handoff gate checklist |

## Acceptance Criteria

1. agent-session.sh stop validates handoff was spawned
2. Clear error message if handoff missing
3. All agent .md files have explicit handoff checklist
4. Cannot complete phase without handoff (enforced, not just documented)
5. Works for approve, reject, and pass-through handoffs

## Points: 2 (Trivial - direct to Dev)
