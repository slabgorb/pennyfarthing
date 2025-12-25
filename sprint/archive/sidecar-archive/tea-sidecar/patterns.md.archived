# TEA Agent Patterns

> Testing patterns for test-first development

## RED State Protocol

### Write Failing Tests First
1. Read acceptance criteria from session file
2. Design test cases covering each AC
3. Write tests that FAIL (no implementation yet)
4. Verify tests fail for the right reason

### Test Naming Convention
```go
func TestComponentName_WhenCondition_ExpectsBehavior(t *testing.T)
```

```typescript
describe('ComponentName', () => {
  it('should behavior when condition', () => {})
})
```

## Test Design Patterns

### Table-Driven Tests (Go)
```go
tests := []struct {
    name     string
    input    Input
    expected Output
    wantErr  bool
}{
    {"valid input", validInput, expectedOutput, false},
    {"invalid input", invalidInput, nil, true},
}

for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
        // test logic
    })
}
```

### Arrange-Act-Assert
```go
// Arrange
sut := NewComponent(deps)
input := createTestInput()

// Act
result, err := sut.Method(input)

// Assert
require.NoError(t, err)
assert.Equal(t, expected, result)
```

## Mocking Patterns

### Interface-Based Mocking
Define interfaces for dependencies, mock in tests:
```go
type Repository interface {
    Get(id string) (*Entity, error)
}

type MockRepository struct {
    GetFunc func(id string) (*Entity, error)
}
```

### Test Fixtures
- Place in `testdata/` directory
- Use descriptive names: `valid_request.json`, `malformed_input.json`
- Document fixture purpose in comments

## Verification Approach

### Coverage Targets
- Unit tests: Cover all public methods
- Edge cases: Empty inputs, boundaries, errors
- Integration: Happy path + critical failures

### Test Independence
- Each test should run in isolation
- No shared mutable state between tests
- Clean up after each test

## Handoff to Dev

### Assessment Format
```markdown
## TEA Assessment
**Tests:** X failing tests written (RED state confirmed)
**Coverage:** All acceptance criteria covered
**Files:**
- api/internal/service/component_test.go (new)
- ui/src/components/Component.test.tsx (new)

Ready for Dev to implement to GREEN.
```

## Context Budget

Target: 450-600 lines loaded
- Agent file: ~150 lines
- Session file: ~50 lines
- Existing test patterns: ~100 lines
- Story context: ~100 lines

---

*Add patterns discovered during test development below*
