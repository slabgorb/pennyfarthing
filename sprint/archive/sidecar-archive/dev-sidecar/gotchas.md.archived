# Dev Agent Gotchas

> Common mistakes and pitfalls to avoid during implementation

## Path and Directory Issues

### Relative Path Failures
**Problem:** Using relative paths that assume current directory
```bash
# WRONG
cd API && just test

# RIGHT
cd $PROJECT_ROOT/$API_REPO && just test
```
**Why:** The current directory is not guaranteed between tool calls.

### Missing Directory Check
**Problem:** Creating files without verifying parent directory exists
**Solution:** Always `ls` parent directory before creating files

### Hook Paths in settings.local.json
**Problem:** Using relative paths for hook commands breaks when Claude runs from subdirectories
```json
// WRONG - breaks from subdirectories
"command": "scripts/hooks/session-start.sh"

// RIGHT - always resolves to project root
"command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/session-start.sh"
```
**Why:** Hook commands resolve relative to Claude's CWD, not project root. `$CLAUDE_PROJECT_DIR` is set by Claude Code to the directory where it was started.
**Note:** `git rev-parse --show-toplevel` doesn't work as fallback - returns wrong root in nested repos.

## Go-Specific Gotchas

### Context Cancellation
**Problem:** Not propagating context cancellation
```go
// WRONG
func handler(ctx context.Context) {
    go processAsync()  // Context not passed
}

// RIGHT
func handler(ctx context.Context) {
    go processAsync(ctx)
}
```

### Error Wrapping
**Problem:** Losing error context
```go
// WRONG
return err

// RIGHT
return fmt.Errorf("failed to process user %s: %w", userID, err)
```

### Nil Pointer Dereference
**Problem:** Not checking for nil before accessing
**Solution:** Always check `if x != nil` before dereferencing

## React/TypeScript Gotchas

### Stale Closure in useEffect
**Problem:** Referencing stale state in callbacks
```typescript
// WRONG
useEffect(() => {
    const id = setInterval(() => {
        console.log(count)  // Always logs initial value
    }, 1000)
}, [])  // Missing dependency

// RIGHT
useEffect(() => {
    const id = setInterval(() => {
        console.log(count)
    }, 1000)
    return () => clearInterval(id)
}, [count])
```

### Missing Key Prop
**Problem:** Not providing unique keys in lists
```tsx
// WRONG
{items.map(item => <Item data={item} />)}

// RIGHT
{items.map(item => <Item key={item.id} data={item} />)}
```

## Test-Related Gotchas

### Tests Pass Locally, Fail in CI
**Causes:**
- Race conditions (parallel tests)
- Environment differences
- Hardcoded paths
- Timezone assumptions

### Mock Not Reset Between Tests
**Problem:** Mocks bleed between test cases
**Solution:** Reset mocks in `beforeEach` or use fresh instances

## Git and PR Gotchas

### Committing Secrets
**Problem:** Accidentally committing API keys, passwords
**Solution:** Check `git diff --staged` before committing

### Force Push to Shared Branch
**Problem:** Rewriting history others depend on
**Solution:** Never `git push --force` to `main` or `develop`

### Large Files in Git
**Problem:** Committing binary files or large assets
**Solution:** Use `.gitignore` or Git LFS

## API Gotchas

### N+1 Queries
**Problem:** Fetching related data in a loop
```go
// WRONG
for _, user := range users {
    orders := db.GetOrdersByUser(user.ID)  // N queries
}

// RIGHT
orders := db.GetOrdersByUsers(userIDs)  // 1 query
```

### Missing Transaction
**Problem:** Multi-step operations without transaction
**Solution:** Wrap related writes in a transaction

## Handoff Gotchas

### Not Writing Assessment
**Problem:** Offering handoff without writing assessment to session file
**Solution:** Always Edit session file BEFORE spawning handoff subagent

### Incomplete PR Description
**Problem:** PR description missing context for reviewer
**Solution:** Include summary, test plan, and acceptance criteria references

---

*Add gotchas discovered during implementation below*
