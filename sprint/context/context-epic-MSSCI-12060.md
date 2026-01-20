# Epic MSSCI-12060: Stepped Workflow Support (BMAD-Inspired)

## Overview

Extend Pennyfarthing's workflow system to support BMAD-style stepped workflows with progressive disclosure, gates, and tri-modal execution. This makes stepped workflows a first-class Pennyfarthing capability alongside existing phased workflows (TDD, trivial, BDD).

**ADR:** `docs/adr/0005-bmad-workflow-import.md`
**Epic Jira:** MSSCI-12077

## Technical Landscape

### Current Workflow System

Pennyfarthing uses YAML-based workflow definitions in `pennyfarthing-dist/workflows/`:

```
pennyfarthing-dist/workflows/
├── tdd.yaml       # Test-driven development (default)
├── trivial.yaml   # Quick fixes, skip TEA
├── bdd.yaml       # Behavior-driven development
└── agent-docs.yaml # Documentation workflow
```

**Current schema** (phased workflows):
```yaml
workflow:
  name: tdd
  description: Test-driven development with code review
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
      output: [session_file, branches, story_context]
    - name: red
      agent: tea
      # ... gates, inputs, outputs

  triggers:
    types: [feature, enhancement]
    points: { min: 3 }
    default: true
```

### Target: Stepped Workflow Support

Add `type: stepped` to enable BMAD-style execution:

```yaml
workflow:
  name: architecture
  type: stepped              # NEW

  steps:                     # NEW
    path: ./steps/
    pattern: step-{nn}-*.md

  modes:                     # NEW (optional)
    default: create
    create: ./steps/
    validate: ./steps-v/

  variables:                 # NEW
    output_file: planning-artifacts/architecture.md

  gates:                     # NEW
    after_steps: [1, 3, 7]
    gate_marker: "<!-- GATE -->"

  template: ./templates/architecture.md  # NEW
  agent: architect
```

### Key Patterns

1. **Backward compatibility** - `type: phased` (or absent) = existing behavior
2. **Progressive disclosure** - One step file loaded at a time
3. **Session-based state** - Track progress in `.session/` files
4. **Variable resolution** - Priority chain: Workflow → Session → Config → Environment → Defaults

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/workflows/*.yaml` | Workflow definitions (will add schema extension) |
| `docs/adr/0005-bmad-workflow-import.md` | ADR with full specification |
| `.claude/skills/workflow/skill.md` | Workflow skill (will need command updates) |
| `.session/{id}-session.md` | Session files (will add Workflow State section) |

## Story Sequence

| Story | Title | Points | Priority |
|-------|-------|--------|----------|
| MSSCI-12078 | Workflow YAML schema extension | 2 | P0 |
| MSSCI-12079 | Step file parser | 2 | P0 |
| MSSCI-12081 | Variable resolver | 2 | P0 |
| MSSCI-12082 | Session file state tracking | 2 | P0 |
| MSSCI-12083 | /workflow list command | 1 | P1 |
| MSSCI-12084 | /workflow start/resume commands | 3 | P1 |
| MSSCI-12085 | Gate detection and approval | 2 | P2 |
| MSSCI-12086 | Tri-modal support | 2 | P2 |
| MSSCI-12087 | Example architecture workflow | 1 | P2 |

## Dependencies

- Existing workflow YAML files must continue to work unchanged
- Session file format must remain compatible with existing stories
- `/workflow` skill exists but needs extension

## Testing Strategy

- Unit tests for schema validation (Zod or similar)
- Integration tests for workflow loading
- Regression tests ensuring phased workflows unchanged
- Test fixtures with both phased and stepped workflow YAMLs
