# TEA Agent Patterns

> Pennyfarthing-specific testing patterns

## RED State Protocol

1. Read acceptance criteria from session file
2. Design test cases covering each AC
3. Write tests that FAIL (no implementation yet)
4. Verify tests fail for the right reason

## TEA Assessment Format

```markdown
## TEA Assessment
**Tests:** X failing tests written (RED state confirmed)
**Coverage:** All acceptance criteria covered
**Files:**
- api/internal/service/component_test.go (new)
- ui/src/components/Component.test.tsx (new)

Ready for Dev to implement to GREEN.
```

## Test File Placement

### Go
```
internal/service/user.go
internal/service/user_test.go
```

### React
```
src/components/User.tsx
src/components/User.test.tsx
```

---

*Add testing patterns discovered during test development below*
