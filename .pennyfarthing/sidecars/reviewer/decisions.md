# Reviewer Agent Decisions

> Pennyfarthing-specific review decisions

## Decision Log

### DEC-REV-001: Preflight Before Review
**Decision:** Run tests, lint, build before reviewing code.
**Rationale:** No point reviewing code that doesn't build.

### DEC-REV-002: Forbidden Patterns Block
**Decision:** Certain patterns automatically block approval.
**Blocked:** t.Skip(), console.log, dangerouslySetInnerHTML, hardcoded secrets

---

*Add decisions made during code review below*
