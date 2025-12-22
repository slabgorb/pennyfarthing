# Reviewer Agent Patterns

> Code review patterns for quality enforcement

## Review Philosophy

### Adversarial but Constructive
- Look for what could go wrong
- Question assumptions
- Verify claims with evidence
- Provide actionable feedback

### Review Priorities
1. **Security**: Vulnerabilities, injection, auth issues
2. **Correctness**: Does it do what it claims?
3. **Maintainability**: Can others understand it?
4. **Performance**: Obvious inefficiencies
5. **Style**: Consistency with codebase

## Pre-Review Verification

### Preflight Checks
Before reviewing code:
```bash
# Tests must pass
cd $PROJECT_ROOT/$API_REPO && just test
cd $PROJECT_ROOT/$UI_REPO && npm test

# Lint must pass
cd $PROJECT_ROOT/$API_REPO && just lint
cd $PROJECT_ROOT/$UI_REPO && npm run lint

# Build must succeed
cd $PROJECT_ROOT/$API_REPO && just build
cd $PROJECT_ROOT/$UI_REPO && npm run build
```

### Forbidden Patterns
Block if found:
- `t.Skip()` without explanation
- `console.log` in production code
- `dangerouslySetInnerHTML` without sanitization
- Hardcoded credentials or secrets
- `// TODO` without issue reference

## Review Checklist

### Security Review
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Input validation at boundaries
- [ ] Authentication/authorization correct
- [ ] Secrets not hardcoded
- [ ] No sensitive data in logs

### Code Quality Review
- [ ] Functions have single responsibility
- [ ] Error handling is comprehensive
- [ ] Edge cases handled
- [ ] No dead code
- [ ] Naming is clear and consistent

### Test Review
- [ ] Tests cover acceptance criteria
- [ ] Tests are independent
- [ ] No flaky tests
- [ ] Mocks used appropriately
- [ ] Edge cases tested

## Feedback Format

### Issue Categories
```markdown
## Review Findings

### Critical (Must Fix)
- **Security**: [description] in `file:line`
- **Bug**: [description] in `file:line`

### Warnings (Should Fix)
- **Performance**: [description] in `file:line`
- **Maintainability**: [description] in `file:line`

### Suggestions (Consider)
- **Style**: [description] in `file:line`
```

### Actionable Feedback
Bad: "This is wrong"
Good: "This SQL query is vulnerable to injection. Use parameterized queries: `db.Query(ctx, query, args...)`"

## Approval Criteria

### Approve When
- All tests pass
- No security issues
- Code is maintainable
- Meets acceptance criteria
- PR description is clear

### Reject When
- Tests fail or missing
- Security vulnerabilities found
- Major bugs identified
- Acceptance criteria not met

## Handoff Patterns

### Approval Handoff
```markdown
## Reviewer Assessment
**Decision:** APPROVED
**Tests:** All passing
**Security:** No issues found
**Quality:** Meets standards

Ready for SM to finish story.
```

### Rejection Handoff
```markdown
## Reviewer Assessment
**Decision:** CHANGES REQUESTED
**Issues:**
1. [Issue description] - [file:line]
2. [Issue description] - [file:line]

**Required Actions:**
- [ ] Fix issue 1
- [ ] Fix issue 2

Returning to Dev for fixes.
```

---

*Add patterns discovered during reviews below*
