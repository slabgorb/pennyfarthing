# Story 31-3: Story-to-workflow routing engine - Summary

## What Was Built

A workflow routing engine that matches stories to appropriate workflows based on a 5-level priority algorithm. The router accepts story metadata (id, type, tags, points) and returns the best-matching workflow definition with a human-readable reason for debugging.

## Key Technical Decisions

1. **Priority Algorithm Order**: Explicit workflow:tag > trigger tags > type match > points range > default fallback. This ensures explicit user intent always wins while providing flexible automatic routing.

2. **Pure Function Design**: `routeStoryToWorkflow()` is a pure function with no side effects - takes inputs, returns result. Makes testing deterministic and composition straightforward.

3. **AND Logic Within Triggers**: When a workflow specifies multiple constraints (e.g., type AND points), ALL must match. This prevents unexpected routing when constraints partially match.

## Implementation Patterns

- Defensive null guards at every entry point (lines 54-56, 157-159, 186-188, 225-227, 256-258)
- Boundary-inclusive ranges using `>=` and `<=` for points matching
- Cascading priority with early return pattern - first match wins
- Human-readable reason strings for debugging workflow decisions

## Files Modified

| File | Change |
|------|--------|
| `packages/core/src/workflow/workflow-router.ts` | NEW - Router implementation (312 lines) |
| `packages/core/src/workflow/workflow-router.test.ts` | NEW - 42 comprehensive tests (815 lines) |

## Test Coverage

- 42 tests covering all 4 acceptance criteria
- Edge cases: zero points, empty tags, case sensitivity, multiple workflow: tags
- Integration tests with real tdd.yaml and trivial.yaml workflows
- 2.6:1 test-to-code ratio

## Lessons for Future Work

1. **Start with types**: Defining `StoryMetadata` and `RoutingResult` interfaces first guided the implementation cleanly.

2. **Priority order matters**: Document priority algorithm explicitly in code comments - it's the core contract that users depend on.

3. **Reason field is essential**: The debugging reason field proved valuable during review and will help users understand why their stories route to specific workflows.

## PR and Review

- **PR #210**: feat(31-3): Story-to-workflow routing engine
- **Reviewer**: Approved with full data flow analysis
- **Merged**: 2026-01-13
