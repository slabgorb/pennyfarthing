# Reviewer Agent Patterns

> Pennyfarthing-specific code review patterns

## Preflight Checks

### Run Before Review
```bash
# Tests must pass
cd $PROJECT_ROOT/$API_REPO && just test
cd $PROJECT_ROOT/$UI_REPO && npm test

# Lint must pass
cd $PROJECT_ROOT/$API_REPO && just lint
cd $PROJECT_ROOT/$UI_REPO && npm run lint
```

## Forbidden Patterns

### Auto-Block If Found
- `t.Skip()` without explanation
- `console.log` in production code
- `dangerouslySetInnerHTML` without sanitization
- Hardcoded credentials or secrets
- `// TODO` without issue reference

## Handoff Format

### Approval
```markdown
## Reviewer Assessment
**Decision:** APPROVED
**Tests:** All passing
**Security:** No issues found

Ready for SM to finish story.
```

### Rejection
```markdown
## Reviewer Assessment
**Decision:** CHANGES REQUESTED
**Issues:**
1. [Issue] - [file:line]

Returning to Dev for fixes.
```

---

*Add review patterns discovered during code review below*
