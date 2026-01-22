# Story 38-9: SM Workflow Routing from Story Tags - Summary

## What Was Built

SM now reads and honors the `workflow:` tag on stories in sprint YAML, enabling custom workflow routing beyond the hardcoded scale-based approach. Stories can explicitly declare which workflow to use (tdd, trivial, agent-docs), and SM follows that workflow's phase sequence for handoffs.

## Key Technical Decisions

1. **Explicit tags take priority** - If a story has `workflow: trivial`, it routes to Dev regardless of points. This allows override of the default scale-based routing.

2. **Type-based specificity** - When multiple workflows match by type (e.g., `refactor` matches both `trivial` and `agent-docs`), the router now prefers workflows with more specific constraints (points ranges). This ensures 2-point refactors route to `trivial` (which has `points.max: 2`), not `agent-docs` (which has no points constraint).

3. **Fallback cascade** - Routing follows priority: explicit tag → trigger tag match → type match → points match → default. TDD is marked `default: true` and serves as the ultimate fallback.

## Implementation Patterns

- **Workflow routing algorithm** at `workflow-router.ts:105-144` - Clean priority-based matching with early returns
- **Specificity scoring** at `workflow-router.ts:243-259` - Collects all type matches, scores by constraint presence, sorts descending
- **YAML extraction** via `yq` in SM agent markdown - Simple bash one-liner for workflow tag extraction
- **Routing table in SM.md** - Clear mapping from workflow to next agent, documented in markdown tables

## Files Modified

| File | Lines | Purpose |
|------|-------|---------|
| `pennyfarthing-dist/agents/sm.md` | +95 | Workflow routing logic, updated handoff tables |
| `packages/core/src/workflow/workflow-router.ts` | +28 | Type matching specificity fix |
| `packages/core/src/workflow/story-workflow-routing.test.ts` | +710 | 21 comprehensive tests |

## Lessons for Future Work

1. **Specificity matters** - When multiple rules can match, always consider which should win. The bug where `refactor` routed to `agent-docs` instead of `trivial` taught us to score by constraint specificity.

2. **Test boundary cases** - The regression test at `workflow-migration.test.ts:353-366` specifically covers the 2-point refactor scenario that motivated the fix.

3. **Document routing in markdown** - Agent markdown is effectively the "code" for agent behavior. Clear routing tables in SM.md make the logic visible and maintainable.

4. **Fallback is essential** - Unknown workflow tags or missing tags should degrade gracefully to TDD. Never fail hard when a sensible default exists.
