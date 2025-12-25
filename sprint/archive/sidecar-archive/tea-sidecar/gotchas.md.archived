# TEA Agent Gotchas

> Common mistakes and pitfalls in test development

## Test Design Pitfalls

### Testing Implementation Not Behavior
**Problem:** Tests that break when implementation changes
```go
// WRONG - tests internal structure
assert.Equal(t, user.privateField, expected)

// RIGHT - tests observable behavior
result := user.GetDisplayName()
assert.Equal(t, result, expected)
```

### Flaky Tests
**Causes:**
- Race conditions in async code
- Time-dependent assertions
- Shared state between tests
- External service dependencies

**Solutions:**
- Use proper synchronization
- Mock time, use relative durations
- Isolate test state
- Mock external services

## Mock Gotchas

### Over-Mocking
**Problem:** Mocking so much that tests don't verify real behavior
**Solution:** Only mock at boundaries (databases, external APIs)

### Mock Verification Forgotten
**Problem:** Setting up mocks but not verifying they were called
```go
// Set expectation
mock.On("Save", user).Return(nil)

// FORGOT: mock.AssertExpectations(t)
```

### Incorrect Mock Return Values
**Problem:** Mocks returning values that wouldn't happen in production
**Solution:** Use realistic test data

## Test Container Issues

### Container Not Running
**Problem:** Integration tests fail because test DB not started
```bash
# Verify container running
docker ps | grep -q "$TEST_CONTAINER" || just test-api-setup
```

### Port Conflicts
**Problem:** Multiple test runs competing for same ports
**Solution:** Use unique run IDs, random ports, or sequential execution

### Dirty Database State
**Problem:** Previous test data affecting current test
**Solution:** Clean DB before each test or use transactions with rollback

## Coverage Pitfalls

### Coverage Without Quality
**Problem:** High coverage but tests don't actually verify behavior
```go
// This achieves coverage but tests nothing
func TestFunction(t *testing.T) {
    Function()  // No assertions!
}
```

### Missing Edge Cases
**Common misses:**
- Empty inputs
- Nil/null values
- Boundary conditions
- Error paths
- Concurrent access

## Async Testing Gotchas

### Race Conditions in Tests
**Problem:** Tests pass/fail randomly
```go
// WRONG
go doSomething()
assert.Equal(t, expected, result)  // May run before doSomething completes

// RIGHT
done := make(chan struct{})
go func() {
    doSomething()
    close(done)
}()
<-done
assert.Equal(t, expected, result)
```

### Timeout Too Short/Long
**Problem:** Tests timeout in CI but pass locally (or vice versa)
**Solution:** Use reasonable timeouts, make them configurable

## React Testing Gotchas

### Not Waiting for Async Updates
```typescript
// WRONG
fireEvent.click(button)
expect(result).toBeInTheDocument()  // May fail, not yet rendered

// RIGHT
fireEvent.click(button)
await waitFor(() => {
    expect(result).toBeInTheDocument()
})
```

### Testing Implementation Details
**Problem:** Testing internal component state instead of user-visible behavior
**Solution:** Test what users see and interact with

## Handoff Gotchas

### Tests Not Actually Failing
**Problem:** Claiming RED state but tests pass (or don't run)
**Verification:**
```bash
# Must see actual failures
go test ./... 2>&1 | grep -q "FAIL"
npm test 2>&1 | grep -q "failed"
```

### Tests Fail for Wrong Reason
**Problem:** Tests fail due to syntax errors, not missing implementation
**Solution:** Verify tests compile and fail on assertions

---

*Add gotchas discovered during test development below*
