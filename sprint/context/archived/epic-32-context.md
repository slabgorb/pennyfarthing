# Epic 32: BMAD Artifact Compatibility - Technical Context

## Epic Overview

**Goal:** Enable Pennyfarthing to work with BMAD-generated planning artifacts and produce outputs BMAD tooling can consume. Focus on artifact interoperability: import BMAD stories/epics, work in our TDD flow, export results back to BMAD format.

**Value:** Teams can use BMAD for planning and Pennyfarthing for execution - seamless artifact conversion in both directions, no tool switching required during development cycles.

**Points:** 11 (6 stories)
**Repos:** pennyfarthing
**Independence:** No dependency on Epic 31 - works with existing workflow

## What is BMAD?

BMAD (Build Measure Analyze Decide) is an AI-assisted planning framework that generates structured artifacts for software development. Key characteristics:

- **Story files:** Markdown templates with structured sections for status, acceptance criteria, tasks, dev notes
- **Epic files:** Hierarchical epic/story structures with BDD-style acceptance criteria
- **Sprint status:** YAML-based status tracking similar to Pennyfarthing
- **Project context:** Technology stack and implementation rules for AI agents

BMAD excels at planning; Pennyfarthing excels at execution. This epic bridges them.

## Current State

### Pennyfarthing Formats

**Sprint YAML (`sprint/current-sprint.yaml`):**
```yaml
epics:
  - id: epic-N
    title: "Title"
    stories:
      - id: N-M
        title: "Story"
        status: backlog|in_progress|done
        acceptance_criteria:
          - "AC 1"
          - "AC 2"
```

**Session Files (`.session/{story-id}-session.md`):**
```markdown
# Story N-M: Title

## Metadata
story: N-M
assigned_to: Name
status: in_progress

## Acceptance Criteria
- [ ] AC 1
- [ ] AC 2

## Dev Notes
[Work log entries]
```

### BMAD Formats (to be documented in 32-1)

**BMAD Story File (template.md):**
```markdown
# Story: [Title]

## Status
[ready-for-dev | in-progress | review | done]

## Story
As a [user], I want [feature], so that [benefit]

## Acceptance Criteria
- Given [context], When [action], Then [result]

## Tasks / Subtasks
- [ ] Task 1
- [ ] Task 2

## Dev Notes
[Notes added during development]

## Dev Agent Record
[AI agent session logs]

## File List
[Files modified during implementation]
```

**BMAD Epics File (epics.md):**
```markdown
# Epic N: [Title]

## Story N.1: [Title]
**Points:** X

### Acceptance Criteria
- Given..., When..., Then...

### Requirements Coverage
- REQ-001: Description
```

**BMAD Sprint Status (sprint-status.yaml):**
```yaml
stories:
  - id: "N.M"
    status: ready-for-dev | in-progress | review | done
    assignee: Name
```

**BMAD Project Context (project-context.md):**
```markdown
# Project Context

## Technology Stack
- Frontend: React, TypeScript
- Backend: Go, PostgreSQL

## Critical Implementation Rules
1. Rule one
2. Rule two

## AI Agent Guidance
[Instructions for AI assistants]
```

## Story Breakdown

| Story | Title | Points | Priority | Dependencies |
|-------|-------|--------|----------|--------------|
| 32-1 | Document BMAD artifact formats | 1 | P0 | None |
| 32-2 | BMAD story file parser | 2 | P0 | 32-1 |
| 32-3 | BMAD epics+stories importer | 2 | P0 | 32-1 |
| 32-4 | BMAD project-context reader | 2 | P1 | 32-1 |
| 32-5 | Session to BMAD story exporter | 2 | P1 | 32-2 |
| 32-6 | Sprint to BMAD status sync | 2 | P2 | 32-3 |

### Recommended Execution Order

1. **32-1** (1 pt): Document all formats - foundation for everything else
2. **32-2** (2 pts): Parser for importing individual stories
3. **32-3** (2 pts): Importer for bulk epic/story import
4. **32-4** (2 pts): Context reader (can parallel with 32-5)
5. **32-5** (2 pts): Exporter for completed work
6. **32-6** (2 pts): Bidirectional sync (lowest priority)

## Technical Approach

### Format Mapping

| BMAD Concept | Pennyfarthing Equivalent |
|--------------|-------------------------|
| Story N.M | Story N-M (dash vs dot) |
| ready-for-dev | backlog |
| in-progress | in_progress |
| review | needs_review |
| done | done |
| Given/When/Then ACs | Simple text ACs |
| Tasks with checkboxes | Same format |
| Dev Agent Record | Session dev notes |
| File List | Git diff summary |

### Implementation Patterns

**Parsers (32-2, 32-3, 32-4):** Use markdown section parsing
- Split on `## ` headers
- Extract structured data from each section
- Handle variations in formatting

**Exporter (32-5):** Template-based generation
- Load BMAD story template
- Fill sections from session data
- Preserve original formatting where possible

**Sync (32-6):** Conflict-aware bidirectional
- Track last-sync timestamp
- Detect conflicts (both modified since sync)
- Prefer explicit conflict resolution over silent overwrites

### File Locations

| Artifact | Location |
|----------|----------|
| BMAD format reference | `sprint/context/bmad-formats.md` |
| Parser utilities | `pennyfarthing-dist/utils/bmad/` |
| Import skill | `pennyfarthing-dist/skills/bmad-import/` |
| Export skill | `pennyfarthing-dist/skills/bmad-export/` |

## Technical Decisions

### Why Markdown Parsing (not YAML)?

BMAD story files are markdown with structured sections, not YAML. Benefits:
- Human-readable and editable
- Compatible with standard markdown tools
- Sections are clearly delineated

Trade-off: Parsing is more complex than YAML, but section-based parsing is straightforward.

### Import vs. Live Sync

Stories 32-2 through 32-5 are one-time operations (import/export). Story 32-6 adds bidirectional sync for teams actively using both tools. This is P2 because most teams will use one or the other, not both simultaneously.

### Context Loading Strategy (32-4)

BMAD `project-context.md` supplements but doesn't replace `CLAUDE.md`:
- Load project-context.md if present
- Merge with CLAUDE.md context
- CLAUDE.md takes precedence for conflicts

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| BMAD format variations | Document canonical format, handle common variations |
| Large epic imports | Stream processing, report progress |
| BDD AC conversion lossy | Preserve original text, add structured parsing hints |
| Sync conflicts | Timestamp-based detection, require manual resolution |

## Files to Create/Modify

| File | Changes |
|------|---------|
| `sprint/context/bmad-formats.md` | New - format reference (32-1) |
| `pennyfarthing-dist/utils/bmad/story-parser.ts` | New - story parser (32-2) |
| `pennyfarthing-dist/utils/bmad/epic-parser.ts` | New - epic parser (32-3) |
| `pennyfarthing-dist/utils/bmad/context-reader.ts` | New - context reader (32-4) |
| `pennyfarthing-dist/utils/bmad/story-exporter.ts` | New - story exporter (32-5) |
| `pennyfarthing-dist/utils/bmad/status-sync.ts` | New - status sync (32-6) |
| `pennyfarthing-dist/skills/bmad-import/skill.md` | New - import skill |
| `pennyfarthing-dist/skills/bmad-export/skill.md` | New - export skill |

## Success Criteria

1. All BMAD formats documented with examples
2. Can import BMAD stories into Pennyfarthing sessions
3. Can import BMAD epics into sprint YAML
4. BMAD project-context.md loads as agent context
5. Completed sessions export to valid BMAD story format
6. Sprint status syncs bidirectionally (when both tools active)

## Integration with Existing Workflow

Epic 32 is **independent of Epic 31** (Customizable Workflows). BMAD artifacts work with the existing TDD flow:

```
BMAD Planning → Import → Pennyfarthing TDD → Export → BMAD Records
     |                        |                           |
  epics.md              SM → TEA → Dev → Reviewer    story.md updated
  stories/                                           with dev records
```

Teams using BMAD for planning get seamless handoff to Pennyfarthing for execution, then results flow back to BMAD for documentation.
