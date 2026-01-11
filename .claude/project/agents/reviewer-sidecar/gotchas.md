# Reviewer Agent Gotchas

> Pennyfarthing-specific review pitfalls

## Handoff Gotchas

### Approving Failing Tests
**Problem:** Marking approved when tests still fail
**Solution:** Tests MUST pass before approval

### Not Writing Assessment
**Problem:** Approving without documenting decision
**Solution:** Always write assessment to session file BEFORE handoff

---

*Add review gotchas discovered during code review below*

### Approving Stub Implementations
**Problem:** Story 23-1 (Usage Limits Stats Strip) passed review with `startUsagePolling()` containing only TODO comments. Tests passed because they mocked the data layer, but the feature didn't actually work end-to-end. UI showed "100%/100%" because no real data was ever fetched.
**Solution:**
- Stub implementations with TODOs should NOT pass review unless explicitly scoped as "infrastructure only"
- Ask "does this actually work end-to-end?" not just "do tests pass?"
- Require at least one acceptance test that exercises the full data flow
- Manual testing with real system (not mocks) for user-facing features
