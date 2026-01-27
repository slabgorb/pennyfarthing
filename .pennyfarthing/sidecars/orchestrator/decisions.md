# Orchestrator Decisions

> Key architectural decisions for Pennyfarthing

## Decision Log

### DEC-ORCH-001: Automatic Persona Loading
**Date:** January 2026
**Problem:** Agents ignored multi-step persona loading instructions
**Decision:** Scripts output persona directly; agents see it automatically
**Files:** All agent command files, `agent-session.sh`

### DEC-ORCH-002: Merge Config on Init
**Date:** January 2026
**Problem:** Critical hooks missing when settings.local.json existed
**Decision:** Merge required hooks into existing config files
**Files:** `src/cli/commands/init.ts`

### DEC-ORCH-003: .claude Climber Pattern
**Date:** January 2026
**Problem:** $CLAUDE_PROJECT_DIR not available in Bash tool calls
**Decision:** Use inline directory climbing to find project root
**Files:** All agent command files in `.claude/commands/`

### DEC-ORCH-004: Carryover Backlog Items
**Date:** January 2026
**Problem:** Sprint had incomplete stories at retro time
**Decision:** Carry incomplete stories to next sprint with `carried_from` marker
**Rationale:** Maintains traceability; stories keep original IDs; velocity reflects actual completion
**Files:** `sprint/current-sprint.yaml`

### DEC-ORCH-005: Early Epic Start When Ahead
**Date:** January 2026
**Problem:** Sprint completed planned work early
**Decision:** Start next sprint's epic early rather than wait for sprint boundary
**Rationale:** Maintains momentum
**Constraint:** Only start P1 stories from next sprint; keep velocity attribution clean

---

### DEC-ORCH-006: Fix-to-Feature Ratio Target
**Date:** January 2026
**Problem:** High fix-to-feature ratio in early sprints
**Decision:** Target <0.5:1 fix ratio; investigate when exceeded
**Rationale:** High fix ratios indicate shipping too fast, testing too little
**Action:** Add pre-release testing, bundle fixes into fewer releases

### DEC-ORCH-007: Combined Retrospectives for Fast Sprints
**Date:** January 2026
**Problem:** Sprints overlapped in execution (early start pattern)
**Decision:** Write combined retros when sprints complete within days of each other
**Rationale:** Captures cross-sprint patterns better than isolated retros

---

*Add orchestration decisions made during process work below*
