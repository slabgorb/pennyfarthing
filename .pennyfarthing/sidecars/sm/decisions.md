# SM Agent Decisions

> Pennyfarthing-specific story management decisions

## Decision Log

### DEC-SM-001: Scale-Adaptive Routing
**Decision:** Trivial stories (1-2 pts) skip TEA, go directly to Dev.
**Rationale:** Quick fixes shouldn't wait for test design ceremony.

### DEC-SM-002: Session File as Source of Truth
**Decision:** Session file is authoritative for workflow state.
**Rationale:** Single source of truth that survives agent restarts.

### DEC-SM-003: Carryover Backlog Items
**Date:** December 2024
**Problem:** Sprint 2 had 6 points (Epic 4 stories) incomplete at retro
**Decision:** Carry incomplete stories to next sprint with `carried_from: sprint-N` marker
**Rationale:** Maintains traceability; stories keep original IDs; velocity reflects actual completion

### DEC-SM-004: Early Epic Start When Ahead
**Date:** December 2024
**Problem:** Sprint 2 completed 82% of work in 28% of time
**Decision:** Start next sprint's P1 stories early rather than wait for sprint boundary
**Rationale:** Maintains momentum; avoids artificial wait
**Constraint:** Only start P1 stories from next sprint; keep velocity attribution clean

### DEC-SM-005: Team Sprint Alignment
**Date:** January 2026
**Problem:** Pennyfarthing sprints were independent; need alignment with larger team
**Decision:** Adopt team sprint naming convention `TO Sprint YYWW` with Jira sprint ID
**Format:** `name: "TO Sprint 2604"` + `jira_sprint_id: 276` + `jira_sprint_name: "TO Sprint 2604"`
**Rationale:** Sprints are timeboxed by team calendar, not by points completed
**Updated:** January 2026 - renamed `jira_id` to `jira_sprint_id` and added `jira_sprint_name` for clarity

### DEC-SM-006: No Velocity Targets
**Date:** January 2026
**Problem:** `velocity_target` field implied sprints end when points complete
**Decision:** Remove `velocity_target` from sprint schema entirely
**Rationale:** Sprints are timeboxed, not pointed. We do what we can in the sprint.

### DEC-SM-007: Archive Completed Stories
**Date:** January 2026
**Problem:** current-sprint.yaml grew to 1000+ lines with done stories mixed in
**Decision:** Move completed stories to `sprint/archive/sprint-{YYWW}-completed.yaml`
**Structure:**
  - `current-sprint.yaml` contains only active/backlog work
  - Archive file preserves full story details with epic attribution
  - Reference comment in current file points to archive location
**Rationale:** Keeps working file lean and focused on remaining work

---

*Add decisions made during story coordination below*
