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

---

*Add decisions made during story coordination below*
