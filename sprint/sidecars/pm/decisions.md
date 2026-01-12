# PM Agent Decisions

> Key architectural and strategic decisions made during PM work

## Sprint Structure

### Decision: 1-3 Point Stories Only
**Date:** December 2024
**Context:** Stories sized 5+ points consistently overran or carried over
**Decision:** All stories must be 1-3 points; larger work becomes epics
**Outcome:** Better predictability, cleaner sprints

## Sidecar Philosophy

### Decision: Patterns Over Reference Docs
**Date:** December 2024
**Context:** PM sidecar grew to 1,100+ lines with MCP protocol docs, etc.
**Decision:** Sidecars store project-specific patterns, not external references
**Outcome:** Moved reference docs to archive; sidecar stays lean (~100 lines)

## Epic Management

### Decision: Epics in sprint/epics/, Stories in sprint/backlog/
**Date:** December 2024
**Context:** Needed clear separation between strategic vision and tactical work
**Decision:** Epics define vision/scope; stories are atomic work units
**Outcome:** PM focuses on epics, SM focuses on stories

---

*Add decisions made during strategic work below*
