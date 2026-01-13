# Story 31-3: Story-to-workflow routing engine - Technical Context

## Story Overview
| Field | Value |
|-------|-------|
| Epic | 31 - Customizable Workflow Engine |
| Points | 3 |
| Priority | P0 |
| Repos | pennyfarthing |
| Depends On | 31-2 (Workflow loader) - COMPLETE |

## Current State

Story 31-2 delivered the workflow loader (`packages/core/src/workflow/workflow-loader.ts`):
- `loadWorkflowsFromDir(path)` returns all valid `WorkflowDefinition` objects from a directory
- Handles partial results - returns valid workflows even if some files fail validation
- Real workflows exist in `pennyfarthing-dist/workflows/` (tdd.yaml, trivial.yaml)

The schema guide (`pennyfarthing-dist/guides/workflow-schema.md`) defines trigger structure:
```yaml
triggers:
  tags: [tdd, feature]      # Match stories with these tags
  types: [feature, bug]     # Match these story types
  points:
    min: 3                  # Minimum points (inclusive)
    max: 8                  # Maximum points (inclusive)
  default: true             # Use when no other workflow matches
```

## Technical Approach

Create `packages/core/src/workflow/workflow-router.ts` implementing:

### Core Function
```typescript
interface StoryMetadata {
  id: string;
  type?: string;           // feature, bug, chore, docs
  tags?: string[];         // workflow:tdd, workflow:trivial, etc.
  points?: number;
}

interface RoutingResult {
  workflow: WorkflowDefinition;
  reason: string;          // For debugging: "matched tag 'tdd'" or "default workflow"
}

function routeStoryToWorkflow(
  story: StoryMetadata,
  workflows: WorkflowDefinition[]
): RoutingResult | null
```

### Trigger Priority Algorithm (from schema guide L174-180)
1. **Explicit tag match** - Story has `workflow:xyz` tag → use workflow named `xyz`
2. **Specific triggers match** - Check tags, types, points in order
3. **Default fallback** - Use workflow with `triggers.default: true`
4. **No match** - Return null (caller decides behavior)

### Matching Logic
- Tags: Story tags intersect with workflow trigger tags
- Types: Story type in workflow trigger types array
- Points: Story points within min/max range (inclusive)

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/core/src/workflow/workflow-router.ts` | CREATE - Router implementation |
| `packages/core/src/workflow/workflow-router.test.ts` | CREATE - Test suite |
| `packages/core/src/workflow/index.ts` | MODIFY - Export router |

## Acceptance Criteria

- [ ] AC1: Stories with `workflow:xyz` tag use workflow named `xyz`
- [ ] AC2: Story type mapping to workflows configurable via triggers.types
- [ ] AC3: Default workflow used when no other match
- [ ] AC4: Routing decision logged for debugging (reason field in result)

## Testing Strategy

1. **Unit tests for priority algorithm**
   - Explicit tag beats specific match
   - Specific match beats default
   - Points range matching (boundary cases)

2. **Integration tests with real workflows**
   - Load tdd.yaml + trivial.yaml
   - Route various story types
   - Verify expected workflow selection

3. **Edge cases**
   - No workflows loaded → null
   - Multiple matches → first by priority wins
   - Invalid/missing story metadata → graceful handling

## Dependencies & Risks

**Dependencies:**
- Workflow loader (31-2) - COMPLETE
- Schema guide - COMPLETE

**Risks:**
- Multiple workflows matching same criteria - mitigated by defined priority order
- Performance with many workflows - unlikely concern, typically <10 workflows

## Notes for TEA

Focus on the priority algorithm tests first - that's the core contract. The loader integration is straightforward since 31-2 provides clean interfaces.

Key test scenarios:
1. Story with `workflow:trivial` tag → trivial.yaml
2. Story with type `feature`, 3 points → tdd.yaml (via triggers)
3. Story with no matching triggers → default workflow
4. Story with `workflow:nonexistent` tag → fallback behavior
