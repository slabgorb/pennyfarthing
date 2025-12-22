# Reviewer Agent Gotchas

> Common mistakes and pitfalls in code review

## Review Process Pitfalls

### Reviewing Without Running Tests
**Problem:** Approving code that doesn't pass tests
**Solution:** ALWAYS run tests before review decision

### Missing Preflight Checks
**Problem:** Skipping lint, build verification
**Solution:** Run full preflight: test, lint, build

### Reviewing Too Quickly
**Problem:** Missing issues due to rushed review
**Solution:** Take time to understand changes, trace logic

## Security Review Gotchas

### SQL Injection Missed
**Problem:** String concatenation in queries
```go
// DANGEROUS
query := "SELECT * FROM users WHERE id = " + userID

// SAFE
query := "SELECT * FROM users WHERE id = $1"
db.Query(query, userID)
```

### XSS Vulnerabilities
**Problem:** Unescaped user input in HTML
```tsx
// DANGEROUS
<div dangerouslySetInnerHTML={{__html: userInput}} />

// SAFE
<div>{userInput}</div>  // React escapes by default
```

### Hardcoded Secrets
**Problem:** API keys, passwords in code
**Where to look:**
- Configuration files
- Test fixtures
- Comments
- Environment setup

### Auth Bypass
**Problem:** Missing authorization checks
**Verify:**
- Every endpoint checks permissions
- User can only access their own data
- Admin functions protected

## Code Quality Gotchas

### Dead Code Approved
**Problem:** Unused functions, unreachable branches
**Solution:** Check for unused exports, impossible conditions

### Error Handling Ignored
**Problem:** Errors silently swallowed
```go
// WRONG
result, _ := doSomething()  // Error ignored!

// RIGHT
result, err := doSomething()
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}
```

### Copy-Paste Code
**Problem:** Duplicated logic that should be abstracted
**Solution:** Suggest extraction if >3 similar blocks

## Test Review Gotchas

### Tests Without Assertions
**Problem:** Tests that don't actually verify anything
```go
func TestSomething(t *testing.T) {
    DoSomething()  // No assert!
}
```

### Flaky Test Approved
**Warning signs:**
- Random values without seeds
- Time-dependent logic
- Shared state
- Missing synchronization

### t.Skip() Without Reason
**Problem:** Skipped tests hiding real issues
**Solution:** Require comment explaining why skipped

## PR Review Gotchas

### Approving Incomplete Work
**Problem:** PR doesn't fully implement acceptance criteria
**Solution:** Verify each AC is addressed

### Missing Test Coverage
**Problem:** New code without corresponding tests
**Solution:** Check coverage diff, require tests for new logic

### Breaking Changes Not Documented
**Problem:** API changes without migration notes
**Solution:** Require changelog/migration guide for breaking changes

## Feedback Gotchas

### Vague Feedback
**Problem:** "This looks wrong" without explanation
**Solution:** Always explain WHY and suggest HOW to fix

### Nitpicking Over Substance
**Problem:** Focusing on style while missing bugs
**Solution:** Prioritize correctness > security > maintainability > style

### Blocking on Opinion
**Problem:** Blocking PR for stylistic preferences
**Solution:** Use "suggestion" for non-blocking feedback

## Handoff Gotchas

### Approving Failing Tests
**Problem:** Marking approved when tests still fail
**Solution:** Tests MUST pass before approval

### Not Writing Assessment
**Problem:** Approving without documenting decision
**Solution:** Always write assessment to session file

### Vague Rejection
**Problem:** Rejecting without clear action items
**Solution:** List specific issues with file:line references

---

*Add gotchas discovered during reviews below*
