# SM Agent Decisions

> Pennyfarthing-specific story management decisions

## Decision Log

### DEC-SM-001: Scale-Adaptive Routing
**Decision:** Trivial stories (1-2 pts) skip TEA, go directly to Dev.
**Rationale:** Quick fixes shouldn't wait for test design ceremony.

### DEC-SM-002: Session File as Source of Truth
**Decision:** Session file is authoritative for workflow state.
**Rationale:** Single source of truth that survives agent restarts.

### DEC-SM-005: Team Sprint Alignment
**Date:** January 2026
**Decision:** Adopt team sprint naming convention `TO Sprint YYWW` with Jira sprint ID
**Format:** `name: "TO Sprint 2604"` + `jira_sprint_id: 276` + `jira_sprint_name: "TO Sprint 2604"`
**Rationale:** Sprints are timeboxed by team calendar, not by points completed
**Updated:** January 2026 - renamed `jira_id` to `jira_sprint_id` and added `jira_sprint_name` for clarity

### DEC-SM-007: Archive Completed Stories
**Date:** January 2026
**Decision:** Move completed stories to `sprint/archive/sprint-{YYWW}-completed.yaml`
**Rationale:** Keeps working file lean and focused on remaining work

---

*Add decisions made during story coordination below*
