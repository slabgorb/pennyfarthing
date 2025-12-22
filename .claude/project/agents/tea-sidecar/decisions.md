# TEA Agent Decisions

> Architecture decisions and constraints for test strategy

## Decision Log

### DEC-TEA-001: RED State Before Handoff

**Decision:** All tests must be verified failing before handing to Dev.

**Context:** TDD requires RED → GREEN → Refactor cycle.

**Rationale:**
- Confirms tests actually test something
- Prevents false confidence from passing tests
- Validates test setup works

**Consequences:**
- TEA must run tests and see failures
- Cannot hand off tests that pass
- Must verify failure reason is correct

---

### DEC-TEA-002: Acceptance Criteria Coverage

**Decision:** Every AC must have at least one corresponding test.

**Context:** Tests prove acceptance criteria are met.

**Rationale:**
- Traceability between requirements and tests
- Ensures nothing is missed
- Provides clear done criteria

**Consequences:**
- TEA assessment must map tests to ACs
- Vague ACs require clarification from SM
- May need multiple tests per AC

---

### DEC-TEA-003: Test File Placement

**Decision:** Tests live alongside implementation files.

**Context:** Go and React conventions differ.

**Go:**
```
internal/service/user.go
internal/service/user_test.go
```

**React:**
```
src/components/User.tsx
src/components/User.test.tsx
```

**Rationale:**
- Follow language conventions
- Easy to find related tests
- IDE support works better

**Consequences:**
- No separate test directory
- Test utilities in `testdata/` or `__mocks__/`

---

### DEC-TEA-004: Integration Test Scope

**Decision:** Integration tests cover API boundaries, not internal layers.

**Context:** Balance between coverage and speed.

**Rationale:**
- API tests verify full stack
- Internal layers tested via unit tests
- Faster test suite

**Consequences:**
- Mock external services in integration tests
- Test database used for persistence tests
- Skip integration tests in watch mode

---

## Constraints

### C-TEA-001: No Implementation
- TEA writes tests only
- Implementation is Dev's responsibility
- If tempted to implement, stop

### C-TEA-002: Test Independence
- Each test must run in isolation
- No shared mutable state
- Order-independent execution

### C-TEA-003: Meaningful Names
- Test names describe behavior
- `TestUser_WhenInvalid_ReturnsError` not `TestUser1`
- Self-documenting tests

---

*Add new decisions below as they are made*
