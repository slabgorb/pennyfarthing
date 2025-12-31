---
name: dev-patterns
description: Common development patterns, fixes, and gotchas. Use when implementing features, debugging issues, or avoiding known pitfalls.
---

# Dev Patterns Skill

## Overview

This skill captures common development patterns, fixes, and gotchas that apply across projects using the pennyfarthing agent framework.

## Critical Patterns

### Bash Tool Working Directory

**Problem:** The Bash tool maintains a persistent working directory. Relative `cd` commands fail when already in a different directory.

**Symptoms:**
- `cd API && just test` fails with "no such file or directory"
- Commands fail because assuming wrong directory

**Solution:** Always use absolute paths with `$CLAUDE_PROJECT_DIR`:

```bash
# WRONG - relative cd fails if you're already somewhere else
cd API && just test

# CORRECT - absolute path always works
cd $CLAUDE_PROJECT_DIR/API && just test
```

**Best Practice:** Explicit `cd` with absolute path in every Bash call:

```bash
# Single-repo: from anywhere - always works
cd $CLAUDE_PROJECT_DIR && git push -u origin feat/branch
cd $CLAUDE_PROJECT_DIR && just test

# Multi-repo: use repo-utils.sh for dynamic lookup
source $CLAUDE_PROJECT_DIR/scripts/repo-utils.sh
cd $CLAUDE_PROJECT_DIR/$(get_repo_path "myrepo") && just test
```

### TypeScript Type Imports

**Problem:** Build fails with `verbatimModuleSyntax` errors.

**Solution:** Use `import type` for type-only imports:

```typescript
// WRONG - causes build errors
import { User, Ticket } from '@/types';

// CORRECT
import type { User, Ticket } from '@/types';
```

### Go Error Handling

**Problem:** Silent failures when errors aren't checked.

**Solution:** Always handle errors explicitly:

```go
// WRONG - ignores error
result, _ := doSomething()

// CORRECT
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething failed: %w", err)
}
```

### UUID Parsing

**Problem:** Invalid UUIDs cause panics or unexpected behavior.

**Solution:** Always validate UUID parsing:

```go
// WRONG - panics on invalid UUID
id := uuid.MustParse(rawID)

// CORRECT
id, err := uuid.Parse(rawID)
if err != nil {
    return fmt.Errorf("invalid UUID: %w", err)
}
```

## HTTP Status Codes

Use appropriate status codes consistently:

| Code | When to Use |
|------|-------------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST creating new resource |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Invalid input (validation errors) |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated but not authorized |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | Resource state conflict (duplicate) |
| `500 Internal Server Error` | Server-side error (always log it!) |

## Test Patterns

### Test Isolation

Each test should:
1. Set up its own state
2. Clean up after itself
3. Not depend on other tests' state

```go
func TestCreate(t *testing.T) {
    // Setup
    db := testutil.NewTestDB(t)
    defer db.Cleanup()

    // Test
    result, err := Create(db, input)

    // Assert
    require.NoError(t, err)
    assert.Equal(t, expected, result)
}
```

### Table-Driven Tests

```go
func TestValidate(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        wantErr bool
    }{
        {"valid input", "good", false},
        {"empty input", "", true},
        {"too long", strings.Repeat("x", 1000), true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := Validate(tt.input)
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
            }
        })
    }
}
```

## Common Gotchas

1. **Working directory** - Always use `$CLAUDE_PROJECT_DIR` for absolute paths
2. **Type imports** - Use `import type` for TypeScript types
3. **Error handling** - Never ignore errors in Go
4. **UUID parsing** - Always validate, never panic
5. **Test isolation** - Each test manages its own state

## Project Customization

Projects should create their own dev-patterns skill in `.claude/project/skills/dev-patterns/` with:
- Project-specific patterns and conventions
- Known pitfalls for the tech stack
- File location conventions
