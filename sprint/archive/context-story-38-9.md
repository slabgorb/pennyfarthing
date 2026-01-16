# Story 38-9: SM Workflow Routing from Story Tags - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 38 - Agent File Modernization |
| Points | 3 |
| Priority | P1 |
| Repos | pennyfarthing |
| Workflow | tdd |

## Current State

SM currently uses **hardcoded scale-based routing**:
- 1-2 points: Route to Dev (trivial workflow)
- 3+ points: Route to TEA (TDD workflow)

This ignores the `workflow:` tag on stories in sprint YAML. Stories like this one have `workflow: tdd` but that tag is never read.

### Existing Infrastructure

Three workflow definitions exist in `pennyfarthing-dist/workflows/`:

| Workflow | Flow | Triggers |
|----------|------|----------|
| `tdd.yaml` | SM → TEA → Dev → Reviewer → SM | features, 3+ pts, default |
| `trivial.yaml` | SM → Dev → Reviewer → SM | chores/fixes, 1-2 pts |
| `agent-docs.yaml` | SM → Orchestrator → Tech Writer → SM | agent files, process docs |

The `/workflow` skill documents routing priority:
1. **Explicit tag:** `workflow: docs` on story overrides everything
2. **Trigger tags:** Story tags match workflow's `triggers.tags`
3. **Type match:** Story type matches workflow's `triggers.types`
4. **Points match:** Story points within `triggers.points` range
5. **Default:** Workflow with `default: true`

### Current Code Paths

| File | Location | What It Does |
|------|----------|--------------|
| `sm.md` | L304-307, L400-407 | Hardcoded scale table |
| `workflow-status-check.md` | L49-57 | Extracts workflow from session, defaults "tdd" |
| `generic-sm-setup.md` | L30, L134 | Receives {WORKFLOW} param, writes to session |

## Technical Approach

### Phase 1: Read workflow tag from sprint YAML

Before status check, SM reads the story's `workflow:` field from sprint YAML:

```yaml
# In sprint YAML
- id: 38-9
  workflow: tdd  # <-- SM must read this
```

If no tag, apply fallback rules (points-based or triggers).

### Phase 2: Honor the workflow tag in routing

Modify SM's routing logic to:
1. If `workflow:` tag present → use that workflow's phase sequence
2. If no tag → check story type against workflow triggers
3. If no trigger match → use points-based fallback (current behavior)
4. If still no match → default to tdd.yaml

### Phase 3: Pass workflow to subagents

Update SM's calls to `generic-sm-setup`:
- Pass `WORKFLOW: {detected_workflow}` parameter
- Subagent writes workflow to session file's Workflow Tracking section

### Phase 4: Load workflow definition for handoff

When determining handoff target:
1. Read workflow definition from `pennyfarthing-dist/workflows/{name}.yaml`
2. Find current phase in phase sequence
3. Return next phase's agent as handoff target

## Files to Modify

| File | Changes |
|------|---------|
| `pennyfarthing-dist/agents/sm.md` | Add workflow tag reading, dynamic routing table, workflow-aware handoff |
| `pennyfarthing-dist/agents/workflow-status-check.md` | Return detected workflow in output for SM confirmation |

## Acceptance Criteria

- [ ] AC1: SM reads `workflow:` tag from story in sprint YAML
- [ ] AC2: SM loads correct workflow definition from `pennyfarthing-dist/workflows/`
- [ ] AC3: SM follows workflow's phase sequence (e.g., agent-docs routes SM→Orchestrator)
- [ ] AC4: Fallback to TDD if no tag or unknown workflow
- [ ] AC5: Session file records which workflow is active

## Testing Strategy

### Unit Tests (TEA phase)

1. **Test workflow tag reading:**
   - Story with explicit `workflow: trivial` → routes to Dev
   - Story with explicit `workflow: tdd` → routes to TEA
   - Story with explicit `workflow: agent-docs` → routes to Orchestrator

2. **Test fallback behavior:**
   - Story with no workflow tag, 1 pt → trivial workflow
   - Story with no workflow tag, 3 pts → tdd workflow
   - Story with unknown workflow tag → warns, falls back to tdd

3. **Test session file recording:**
   - Workflow written to session file's Workflow Tracking section
   - Workflow matches what was selected (not hardcoded "tdd")

### Integration Tests

4. **End-to-end workflow routing:**
   - Create story with `workflow: agent-docs`
   - Verify SM setup completes
   - Verify session file contains `**Workflow:** agent-docs`
   - Verify handoff target is Orchestrator (not TEA)

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing TDD flow | Fallback to tdd.yaml preserves current behavior |
| Invalid workflow tags | Warn and fallback, don't crash |
| Missing workflow definitions | Check file exists before loading |

## Notes

- This story enables Epic 31's custom workflow engine by making SM workflow-aware
- After this, non-TDD workflows (agent-docs) will actually work
- Story 31-17 (bug: trivial workflow phase naming) may need to be addressed after this
