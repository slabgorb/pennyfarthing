# Story 32-1: Document BMAD Artifact Formats - Technical Context

## Story Overview

| Attribute | Value |
|-----------|-------|
| Epic | 32 - BMAD Artifact Compatibility |
| Points | 1 (trivial - skip TEA) |
| Priority | P0 |
| Repos | pennyfarthing |
| Workflow | SM → Dev (direct) |

## Objective

Create a comprehensive reference document for all BMAD artifact formats. This is the foundation story - all subsequent Epic 32 stories depend on this documentation.

## Current State

No BMAD format documentation exists yet. The epic context (`sprint/context/epic-32-context.md`) contains draft templates that need to be expanded into a proper reference with:
- Complete format specifications
- Real-world examples
- Field descriptions
- Edge cases and variations

## Deliverable

Create `sprint/context/bmad-formats.md` containing:

### 1. BMAD Story File Format

Full specification of the story template structure:

```markdown
# Story: [Title]

## Status
[ready-for-dev | in-progress | review | done]

## Story
As a [user type], I want [capability], so that [benefit]

## Acceptance Criteria
- Given [context], When [action], Then [expected result]
- Given [context], When [action], Then [expected result]

## Tasks / Subtasks
- [ ] Task 1
  - [ ] Subtask 1.1
  - [ ] Subtask 1.2
- [ ] Task 2

## Dev Notes
[Notes added during development - timestamps, decisions, blockers]

## Dev Agent Record
[AI agent session log - commands run, files changed, reasoning]

## File List
[Files created/modified during implementation]
- path/to/file1.ts - Created: Description
- path/to/file2.ts - Modified: What changed
```

### 2. BMAD Epics File Format

Structure for `epics.md` containing epic and story hierarchy:

```markdown
# Epic 1: [Epic Title]

[Epic description paragraph]

## Story 1.1: [Story Title]
**Points:** N
**Priority:** P0|P1|P2

### Description
[User story or description]

### Acceptance Criteria
- Given [context], When [action], Then [result]

### Requirements Coverage
- REQ-001: Requirement description
- REQ-002: Another requirement

## Story 1.2: [Another Story]
...
```

### 3. BMAD Sprint Status Format

YAML schema for `sprint-status.yaml`:

```yaml
sprint:
  number: N
  goal: "Sprint goal description"
  start_date: YYYY-MM-DD
  end_date: YYYY-MM-DD

stories:
  - id: "1.1"
    title: "Story title"
    status: ready-for-dev | in-progress | review | done
    assignee: "Developer Name"
    points: N
    started: YYYY-MM-DD
    completed: YYYY-MM-DD

metrics:
  total_points: N
  completed_points: N
  velocity: N
```

### 4. BMAD Project Context Format

Structure for `project-context.md`:

```markdown
# Project Context

## Overview
[Project description and goals]

## Technology Stack

### Frontend
- Framework: React/Vue/etc
- Language: TypeScript
- State: Redux/Zustand/etc

### Backend
- Language: Go/Python/etc
- Database: PostgreSQL/etc
- API: REST/GraphQL

### Infrastructure
- Cloud: AWS/GCP/etc
- CI/CD: GitHub Actions/etc

## Critical Implementation Rules
1. [Rule with rationale]
2. [Another rule]

## AI Agent Guidance
[Specific instructions for AI agents working on this project]

## File Structure
[Key directories and their purposes]
```

## Acceptance Criteria

- [ ] BMAD story format documented with complete field descriptions
- [ ] BMAD epics format documented with hierarchy examples
- [ ] Sprint-status.yaml schema documented
- [ ] Project-context.md structure documented
- [ ] Real examples provided (not just templates)
- [ ] Reference saved to `sprint/context/bmad-formats.md`

## Files to Create

| File | Purpose |
|------|---------|
| `sprint/context/bmad-formats.md` | Comprehensive BMAD format reference |

## Testing Strategy

This is a documentation story - no automated tests. Verification:
- Document is complete and readable
- All four artifact types covered
- Examples are realistic and helpful
- Can be used as reference for stories 32-2 through 32-6

## Notes for Dev

- Use the draft formats in `sprint/context/epic-32-context.md` as starting point
- Add field-by-field descriptions
- Include variations/edge cases where known
- This document will be the source of truth for all BMAD parsing/exporting work
