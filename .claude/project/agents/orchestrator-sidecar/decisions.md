# Orchestrator Decisions

> Key architectural decisions for Pennyfarthing

## Decision Log

### DEC-ORCH-001: Automatic Persona Loading
**Date:** December 2024
**Problem:** Agents ignored multi-step persona loading instructions
**Decision:** Scripts output persona directly; agents see it automatically
**Files:** All agent command files, `agent-session.sh`

### DEC-ORCH-002: Merge Config on Init
**Date:** December 2024
**Problem:** Critical hooks missing when settings.local.json existed
**Decision:** Merge required hooks into existing config files
**Files:** `src/cli/commands/init.ts`

### DEC-ORCH-003: .claude Climber Pattern
**Date:** December 2024
**Problem:** $CLAUDE_PROJECT_DIR not available in Bash tool calls
**Decision:** Use inline directory climbing to find project root
**Files:** All agent command files in `.claude/commands/`

### DEC-ORCH-004: Carryover Backlog Items
**Date:** December 2024
**Problem:** Sprint 2 had 6 points (Epic 4 stories) in backlog at retro time
**Decision:** Carry incomplete stories to Sprint 3 with `carried_from: sprint-2` marker
**Rationale:** Maintains traceability; stories keep original IDs; velocity reflects actual completion
**Files:** `sprint/current-sprint.yaml`

### DEC-ORCH-005: Early Epic Start When Ahead
**Date:** December 2024
**Problem:** Sprint 2 completed planned work early (82% in 28% of time)
**Decision:** Start next sprint's epic early rather than wait for sprint boundary
**Rationale:** Maintains momentum; Epic 6 story 6-1 done before Sprint 2 ends
**Constraint:** Only start P1 stories from next sprint; keep velocity attribution clean

---

*Add orchestration decisions made during process work below*
