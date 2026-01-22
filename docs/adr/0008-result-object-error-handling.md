# ADR-0008: Result Object Error Handling

**Status:** Accepted
**Date:** 2026-01-19
**Author:** Architect (White Queen)

## Context

TypeScript code needs a consistent error handling strategy. The traditional approaches are:

1. **Throwing exceptions** - `throw new Error("message")`
2. **Returning null/undefined** - `return null` on failure
3. **Callback-style** - `callback(err, result)`
4. **Result objects** - `return { success: boolean, data?, error? }`

For an AI agent orchestration framework, we need:
- Explicit error handling (agents must know if operations failed)
- Type-safe error information (structured, not just strings)
- No unexpected runtime crashes from uncaught exceptions
- Consistency across the codebase

## Decision

Functions return structured result objects instead of throwing exceptions for business logic errors.

### Result Object Pattern

```typescript
export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// For operations that create something
export interface CreateResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}
```

### Implementation Example

```typescript
// CORRECT - Result object
export async function createJiraEpic(params: CreateEpicParams): Promise<CreateEpicResult> {
  try {
    const epic = await jira.create(params);
    return {
      success: true,
      jiraKey: epic.key,
      url: epic.url
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// WRONG - Throwing exceptions
export async function createJiraEpic(params: CreateEpicParams): Promise<Epic> {
  const epic = await jira.create(params);
  if (!epic) throw new Error('Failed to create epic');
  return epic;
}
```

### Caller Pattern

```typescript
const result = await createJiraEpic(params);
if (!result.success) {
  logger.error(`Epic creation failed: ${result.error}`);
  return { success: false, error: result.error };
}

// Safe to use result.jiraKey here
```

### When to Still Throw

Exceptions are appropriate for:
- **Programming errors** - Bugs that should never happen in production
- **Unrecoverable failures** - System-level issues (out of memory, disk full)
- **Boundary validation** - Invalid function arguments that indicate caller bugs

```typescript
// OK to throw - programming error
function divideNumbers(a: number, b: number): number {
  if (typeof a !== 'number') throw new TypeError('a must be a number');
  // ...
}
```

## Consequences

### Positive

- **Explicit error handling** - Callers must check `success` before using data
- **Type-safe errors** - Error information is structured, not just strings
- **No uncaught exceptions** - Business logic errors don't crash the process
- **Composable** - Result objects can be easily passed up the call stack
- **Debuggable** - Errors contain context about what failed

### Negative

- **More verbose** - Every call site needs success check
- **Easy to forget** - TypeScript won't enforce checking `success`
- **Different from Node conventions** - Node typically uses callback or throw patterns
- **Nested result handling** - Multiple result objects can get verbose

### Constraints

- **Always check success** - Before accessing data properties
- **Never throw for business errors** - File not found, network timeout, validation
- **Propagate errors up** - Return failure result, don't swallow errors
- **Include context** - Error messages should explain what operation failed

## Alternatives Considered

### 1. Throwing Exceptions

Standard JavaScript error handling.

**Rejected:** Too easy to miss try/catch. Uncaught exceptions crash the process. AI agents need explicit error information.

### 2. Node.js Callback Style

`function foo(callback: (err: Error | null, result?: T) => void)`

**Rejected:** Outdated pattern. Doesn't work well with async/await. Callback hell.

### 3. Either/Result Monads

Full functional programming approach with map/flatMap.

**Rejected:** Over-engineered for this codebase. Requires FP expertise. Simple result objects are sufficient.

### 4. Nullable Returns

Return `T | null` or `T | undefined`.

**Rejected:** Loses error information. Can't distinguish "not found" from "error occurred".

## Implementation Notes

This pattern was adopted early in the project and has proven valuable for:
- Jira integration (`packages/core/src/jira/`)
- BMAD parsing (`packages/core/src/bmad/`)
- Workflow routing (`packages/core/src/workflow/`)

Example from codebase:

```typescript
// packages/core/src/jira/jira-epic-creation.ts
export interface CreateEpicResult {
  success: boolean;
  jiraKey?: string;
  url?: string;
  error?: string;
}
```

## References

- BMAD Architecture Review (2026-01-19)
- TypeScript Handbook: Narrowing
- Go error handling patterns (inspiration)
