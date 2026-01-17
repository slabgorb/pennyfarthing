# Story 38-10: SM Gate for Epic Technical Context - Technical Context

## Story Overview

| Field | Value |
|-------|-------|
| Epic | 38 - Agent File Modernization |
| Points | 2 |
| Priority | P1 |
| Workflow | tdd |
| Repos | pennyfarthing |

## Problem Statement

Currently, SM can start stories without any epic-level technical context. This leads to:
1. Stories starting without understanding the broader technical landscape
2. Repeated context-gathering for each story in an epic
3. Inconsistent preparation quality across stories
4. Risk of conflicting implementations within the same epic

## Current State

**SM's New Work Flow (sm.md L226-387):**
1. Helper researches backlog → returns available stories
2. SM presents options → user selects story
3. Helper summarizes files → SM writes story context
4. Helper sets up story → creates session, branch, claims Jira
5. Helper completes handoff → updates session for TEA

**Missing:** No check for epic-level context before step 3.

**Existing epic context files:**
- `sprint/context/epic-11-context.md` - Example of good epic context
- `sprint/context/epic-{N}-context.md` - Pattern for naming

**generic-sm-setup.md (L39-98)** already checks for context availability in research mode but doesn't enforce it as a gate.

## Technical Approach

### Gate Implementation

Insert a gate check after user selects story, before file summarization:

```
User selects story
    ↓
[NEW] Check: Does sprint/context/context-epic-{N}.md exist?
    ↓
If missing → SM creates epic context (or prompts user)
    ↓
Continue with file summarization
```

### Files to Modify

1. **`.claude/agents/sm.md`** (~20 lines)
   - Add gate check after Step 2 (user selects story)
   - Add epic context creation flow if missing
   - Document the gate in critical-gates section

2. **`.claude/agents/subagents/generic-sm-setup.md`** (~15 lines)
   - Add `MODE: epic-context` for creating epic context
   - Or extend research mode to include epic context check result

3. **`pennyfarthing-dist/guides/`** - New template file
   - `epic-context-template.md` - Template for epic technical context

### Epic Context Template

```markdown
# Epic {N}: {Title} - Technical Context

## Epic Overview
- Goal: {one sentence}
- Stories: {count} totaling {points} pts
- Status: {backlog|in_progress|done}

## Technical Landscape
{2-3 paragraphs describing the technical domain}

## Key Files
| File | Purpose |
|------|---------|
| path/to/file | Description |

## Patterns & Conventions
- Pattern 1: Description
- Pattern 2: Description

## Dependencies & Risks
- Dependency: Description
- Risk: Mitigation

## Story Sequence
| Story | Title | Depends On |
|-------|-------|------------|
| N-1 | Title | None |
| N-2 | Title | N-1 |
```

## Acceptance Criteria

- [ ] **AC1:** SM checks for `sprint/context/context-epic-{N}.md` before story setup
- [ ] **AC2:** Missing epic context blocks story setup with clear message
- [ ] **AC3:** SM can create epic context (researches epic, writes file)
- [ ] **AC4:** Epic context template exists and is documented
- [ ] **AC5:** Gate is documented in sm.md critical-gates section

## Testing Strategy

**Unit tests (if applicable):**
- Test gate check logic in isolation

**Integration tests:**
- SM activation with missing epic context → blocks with message
- SM activation with existing epic context → proceeds normally
- SM creates epic context → file matches template

**Manual verification:**
- Start a story from an epic without context → observe gate behavior
- Create epic context → verify content quality

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Gate too strict for trivial stories | Consider bypass for trivial workflow |
| Epic context creation adds friction | Make template simple, helper does research |
| Existing epics have no context | Gate shows warning, doesn't hard-block initially |

## Implementation Notes

- The gate should be a **warning** initially, not a hard block
- Over time, can tighten to require epic context
- Helper can do the research, SM synthesizes into context file
- Context file lives in `sprint/context/` alongside story summaries
