# Dev Agent Decisions

> Architecture decisions and constraints for feature development

## Decision Log

### DEC-DEV-001: TDD Implementation Flow

**Decision:** Dev implements code to make TEA's failing tests pass (GREEN), not write new tests.

**Context:** Clear separation between test design (TEA) and implementation (Dev).

**Rationale:**
- TEA owns test strategy and design
- Dev focuses on implementation quality
- Clear handoff points reduce confusion

**Consequences:**
- Dev must understand tests without modifying them
- If tests are wrong, route back to TEA
- Dev can add edge case tests after GREEN

---

### DEC-DEV-002: PR Before Handoff

**Decision:** Dev must create PR before handing to Reviewer.

**Context:** Reviewer needs a PR to review against.

**Rationale:**
- Enables GitHub review tools
- Creates audit trail
- Allows CI checks to run

**Consequences:**
- Dev must push all commits before handoff
- PR description must reference story
- Draft PRs acceptable for early feedback

---

### DEC-DEV-003: Absolute Paths Required

**Decision:** All bash commands use `$PROJECT_ROOT` as base.

**Context:** Current directory not guaranteed between tool calls.

**Rationale:**
- Prevents path-related failures
- Works across worktrees
- Consistent behavior

**Consequences:**
- More verbose commands
- Must set PROJECT_ROOT in environment
- Relative paths blocked by convention

---

### DEC-DEV-004: No Direct Test Execution

**Decision:** Dev delegates test runs to testing-runner subagent.

**Context:** Test execution has specific setup requirements.

**Rationale:**
- Central place for test configuration
- Consistent test container management
- Avoids duplicate setup logic

**Consequences:**
- Slightly slower feedback loop
- Depends on subagent availability
- Test failures routed through subagent

---

## Constraints

### C-DEV-001: Context Budget
- Maximum 600 lines loaded
- Story context loaded just-in-time
- Request additional context from SM if needed

### C-DEV-002: No Refactoring in GREEN
- First make tests pass
- Then refactor (with tests still passing)
- Don't combine in same commit

### C-DEV-003: Commit Granularity
- One logical change per commit
- Tests should pass at each commit
- Clear commit messages

---

*Add new decisions below as they are made*
