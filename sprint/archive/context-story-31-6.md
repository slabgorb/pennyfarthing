# Story 31-6: Session File Workflow Tracking - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 31 - Customizable Workflow Engine |
| Points | 2 (trivial - skip TEA) |
| Priority | P1 |
| Repos | pennyfarthing |
| Jira | MSSCI-11610 |
| Unblocks | 31-7 (Generic workflow-driven handoff) |

## Current State

Session files track story state but have no concept of which workflow they're following. The `Phase:` field exists (sm, tea, dev, review, approved) but there's no `Workflow:` field to indicate TDD vs trivial vs custom workflows.

**Current session file structure:**
```markdown
## Story X-Y: [Title]
**Phase:** dev
**Status:** in-progress
**Branch:** feat/X-Y-description
**Repos:** pennyfarthing
```

Story 31-5 created the `/workflow` skill which can list and switch workflows, but it noted: "session file doesn't have workflow: field yet; this skill anticipates it."

## Acceptance Criteria

1. **Session files include workflow section** - Add `## Workflow Tracking` section with structured fields
2. **Tracks workflow name and current phase** - `Workflow:` and `Phase:` fields readable with grep
3. **Records phase transitions with timestamps** - History of when each phase started/ended (ISO 8601)
4. **workflow-status-check reads workflow state** - Subagent extracts and reports workflow field

## Technical Approach

### Session File Format Addition

Add a new `## Workflow Tracking` section after story metadata:

```markdown
## Workflow Tracking
**Workflow:** tdd
**Phase:** green
**Phase Started:** 2026-01-13T14:30:00Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-01-13T14:00:00Z | 2026-01-13T14:15:00Z | 15m |
| red | 2026-01-13T14:15:00Z | 2026-01-13T14:30:00Z | 15m |
| green | 2026-01-13T14:30:00Z | - | - |
```

### Files to Modify

1. **`pennyfarthing-dist/agents/workflow-status-check.md`** (~L14-24)
   - Add extraction of `Workflow:` field from session files
   - Include workflow in output table alongside Phase
   - Report workflow in Active Work Sessions section

2. **`pennyfarthing-dist/guides/tactical-agent-behavior.md`** (~L330-361)
   - Update session file format documentation
   - Add workflow field to Phase Assessment Templates
   - Include workflow awareness in activation steps

3. **Handoff subagents** (`sm-handoff.md`, `tea-handoff.md`, `dev-handoff.md`, `reviewer-handoff-*.md`)
   - Update to write `Workflow:` field when creating/updating sessions
   - Record phase transitions with timestamps

4. **`pennyfarthing-dist/agents/sm-story-setup.md`**
   - Initial session file creation sets `Workflow:` field
   - Determine workflow from routing (31-3) and record it

### Grep-Friendly Format

All fields must be extractable with simple grep:
```bash
# Extract workflow
grep "^\*\*Workflow:\*\*" "$SESSION_FILE" | cut -d: -f2 | xargs

# Extract current phase
grep "^\*\*Phase:\*\*" "$SESSION_FILE" | cut -d: -f2 | xargs

# Extract phase started timestamp
grep "^\*\*Phase Started:\*\*" "$SESSION_FILE" | cut -d: -f2- | xargs
```

## Testing Strategy

Manual verification:
1. Start a new story, verify session file has `## Workflow Tracking` section
2. Progress through phases, verify timestamps recorded
3. Run `workflow-status-check`, verify it reports workflow field
4. Verify grep patterns work for field extraction

## Dependencies & Risks

**Dependencies:**
- Story 31-3 (workflow routing) - DONE - provides the workflow name to record
- Story 31-5 (/workflow skill) - DONE - anticipates this field

**Risks:**
- Backward compatibility: existing session files lack workflow section
- Solution: workflow-status-check treats missing workflow field as "tdd" (default)

## Implementation Notes

- Keep timestamps in ISO 8601 format (timezone-aware)
- Phase history table enables future metrics (average phase duration)
- This directly unblocks 31-7 which needs workflow-aware handoffs
