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

### Approving Unconnected Components (Story MSSCI-12048)
**Problem:** VS Code sidebar TreeDataProvider had all the right methods (`connectToWheelHub()`, `updatePersona()`), but extension.ts never called `connectToWheelHub()`. The WheelHubAdapter was started, the provider was registered, but they were never wired together. Tests passed because they called `updatePersona()` directly.
**Solution:**
- Trace the data flow end-to-end: from source (WheelHub) to sink (UI)
- Check that components are wired, not just that they exist
- Look for placeholder/stub implementations in methods that "exist" but don't work
- Require integration tests that verify actual data flow, not just component behavior

### AC1-style Requirements Need Integration Verification (Story MSSCI-12123)
**Problem:** Welcome view had `hasUserSeenWelcome()` method but extension.ts never called it during activation. AC1 said "appears automatically on first activation" but no code wired the detection to the reveal. Tests passed because they tested the method in isolation, not the integration.
**Solution:**
- When ACs say "automatically" or "on [event]", verify the trigger is wired to the action
- Check that event handlers/lifecycle hooks actually call the methods that implement the behavior
- Compare implementation against technical spec code snippets provided in session file
- Integration tests should verify the full path: event → handler → method → effect
