# Reviewer Agent Patterns

> Pennyfarthing-specific code review patterns

## Preflight Checks

### Run Before Review
```bash
# Single-repo: tests and lint
cd $CLAUDE_PROJECT_DIR && just test
cd $CLAUDE_PROJECT_DIR && just lint

# Multi-repo: use repo-utils.sh
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
for repo in $(get_repo_names); do
    cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")
    $(get_test_command "$repo")
    $(get_lint_command "$repo")
done
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

## EventEmitter Async Handler Pattern

When reviewing code that uses async handlers with EventEmitter:
```typescript
// Pattern to watch for
emitter.on('event', async (data) => {
  const result = await someAsyncOperation(data);
  mightThrow(result);  // <-- Unhandled rejection if this throws
});
```

**Issue:** EventEmitter doesn't await async handlers. Unhandled rejections can crash or silently fail.

**Recommendation:** Wrap handler body in try-catch:
```typescript
emitter.on('event', async (data) => {
  try {
    const result = await someAsyncOperation(data);
    mightThrow(result);
  } catch (err) {
    console.error('Handler error:', err);
  }
});
```

## Regex Pattern Review Checklist

When reviewing regex-based parsing:
1. Test with edge case values (dashes, colons, special chars)
2. Check for catastrophic backtracking (nested quantifiers)
3. Verify global flag behavior with `exec()` loops
4. Confirm captured groups match expected values

## Platform-Specific UI Text Pattern

When reviewing keyboard shortcut displays:
```javascript
// Common issue: hardcoded Mac symbols
title="Plan mode (⌘1)"  // Wrong for Windows users

// Better: dynamic or generic
const modifier = isMac ? '⌘' : 'Ctrl+';
title={`Plan mode (${modifier}1)`}
```

**Checklist:**
- [ ] Check if keyboard shortcuts show correct modifier for platform
- [ ] Verify JavaScript handler uses same platform detection as display text
- [ ] Look for `⌘`, `⇧`, `⌥` symbols that may confuse non-Mac users

## fetch() Error Handling Pattern

When reviewing fetch calls, verify response status is checked:
```javascript
// Problematic - doesn't catch HTTP errors
await fetch('/api/settings', { method: 'PATCH', body: ... });
currentMode = newMode;  // Runs even on 500 error

// Better - explicit status check
const response = await fetch('/api/settings', { method: 'PATCH', body: ... });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
currentMode = newMode;
```

**Note:** `fetch()` only rejects on network failure, not HTTP error status codes.
