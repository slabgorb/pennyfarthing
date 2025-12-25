# Dev Agent Patterns

> Implementation patterns for feature development

## Tool Design

### Require Absolute Paths
Always use `$PROJECT_ROOT` as base for all file operations.

```bash
# Correct
cd $PROJECT_ROOT/$API_REPO && just test

# Wrong - assumes current directory
cd API && just test
```

### Format Selection
Prefer natural formats the model encounters frequently:
- Markdown over complex JSON for documentation
- Simple structures over nested objects
- Clear error messages with recovery guidance

## TDD Implementation

### GREEN State Protocol
1. Read failing tests from TEA assessment
2. Implement minimum code to pass tests
3. Run tests after each change
4. Only refactor after GREEN achieved

### Incremental Implementation
```
For each failing test:
  1. Read test expectations
  2. Implement just enough to pass
  3. Verify: go test -run TestName
  4. Move to next test
```

## Error Handling

### Graceful Degradation
- Validate inputs at boundaries
- Return meaningful error messages
- Don't panic on recoverable errors
- Log context for debugging

### Error Response Pattern
```go
if err != nil {
    return fmt.Errorf("operation failed: %w", err)
}
```

## PR Creation

### Commit Message Format
```
feat(component): brief description

- Bullet point details
- What changed and why

🤖 Generated with Claude Code
```

### PR Description Structure
```markdown
## Summary
[2-3 bullet points on what changed]

## Test Plan
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual verification steps
```

## Multi-Repo Operations

### Iterate with repo-utils.sh
```bash
source $PROJECT_ROOT/scripts/repo-utils.sh
for repo in $(get_repos); do
    repo_path=$(get_repo_path "$repo")
    cd $PROJECT_ROOT/$repo_path
    # operations
done
```

## Context Budget

Target: 450-600 lines loaded
- Agent file: ~180 lines
- Session file: ~50 lines
- Repo context: ~30 lines per repo
- Story context: ~100 lines

---

## Pennyfarthing Version Check

### Quick One-Liner
Check what version of pennyfarthing a repo has:
```bash
jq -r .version .claude/manifest.json
```

---

*Add patterns discovered during implementation below*
