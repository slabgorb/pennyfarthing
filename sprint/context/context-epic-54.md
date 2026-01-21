# Epic 54: BikeLane BMAD Workflow Imports

## Overview

Import all BMAD workflows into Pennyfarthing's BikeLane stepped workflow system. Goal: full BMAD compatibility - any BMAD workflow should run unchanged in Pennyfarthing.

**Epic Jira:** MSSCI-12131
**Source:** `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/`
**Target:** `pennyfarthing-dist/workflows/`

## Technical Landscape

### Completed Foundation (Epic MSSCI-12060)

Epic 50 (Stepped Workflow Support) is complete. We now have:

1. **Schema extension** - `type: stepped` in workflow.yaml
2. **Step file parser** - Extracts `<step-meta>` from step files
3. **Variable resolver** - Priority chain: Workflow → Session → Config → Env → Defaults
4. **Session state tracking** - `.session/` files track stepped workflow progress
5. **`/workflow` commands** - list, start, resume commands
6. **Gate detection** - Approval flow at key decision points
7. **Tri-modal support** - create/validate/edit modes
8. **Example workflow** - Architecture workflow with 7 steps

### Migration Script (MSSCI-12132 - Complete)

`pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs` handles:
- Parse BMAD `workflow.md` with YAML frontmatter
- Extract step files from `steps-c/`, `steps-v/`, `steps-e/`
- Convert variable syntax (`{var-name}` → `{var_name}`)
- Generate `workflow.yaml` with Pennyfarthing schema
- Preserve tri-modal structure
- Copy templates and data directories

### BMAD PRD Workflow Structure

Source: `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/2-plan-workflows/prd/`

```
prd/
├── workflow.md          # Main config with YAML frontmatter
├── steps-c/            # Create mode (13 steps)
│   ├── step-01-init.md
│   ├── step-01b-continue.md
│   ├── step-02-discovery.md
│   ├── step-03-success.md
│   ├── step-04-journeys.md
│   ├── step-05-domain.md
│   ├── step-06-innovation.md
│   ├── step-07-project-type.md
│   ├── step-08-scoping.md
│   ├── step-09-functional.md
│   ├── step-10-nonfunctional.md
│   ├── step-11-polish.md
│   └── step-12-complete.md
├── steps-v/            # Validate mode (14 steps)
├── steps-e/            # Edit mode (5 steps)
├── templates/          # PRD output template
└── data/               # Supporting data files
```

### Pennyfarthing Workflow Schema

```yaml
workflow:
  name: prd
  description: PRD tri-modal workflow - Create, Validate, or Edit PRDs
  version: "1.0.0"
  type: stepped

  steps:
    path: ./steps-c/
    pattern: step-*.md

  modes:
    create: ./steps-c/
    validate: ./steps-v/
    edit: ./steps-e/

  variables:
    project_root: .
    planning_artifacts: ./artifacts
    output_file: artifacts/prd.md

  gates:
    after_steps: [2, 8, 12]  # Discovery, Scoping, Completion
    gate_marker: "<!-- GATE -->"

  template: ./templates/prd-template.md
  agent: pm

  triggers:
    types: [prd, requirements]
    tags: [prd, stepped]
```

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/scripts/migrate-bmad-workflow.mjs` | Migration script |
| `pennyfarthing-dist/workflows/architecture.yaml` | Reference stepped workflow |
| `pennyfarthing-dist/workflows/architecture/` | Reference step files |
| `.claude/skills/workflow/skill.md` | Workflow commands |

## Story Sequence

| Priority | Story | Title | Points |
|----------|-------|-------|--------|
| P0 | MSSCI-12133 | Import PRD workflow (all 3 modes) | 5 |
| P0 | MSSCI-12134 | Import Product Brief workflow | 2 |
| P0 | MSSCI-12135 | Import Research workflow | 2 |
| P1 | MSSCI-12136 | Enhance Architecture workflow from BMAD | 2 |
| P1 | MSSCI-12137 | Import Epics-and-Stories workflow | 3 |
| P1 | MSSCI-12138 | Import Implementation Readiness workflow | 2 |
| P1 | MSSCI-12139 | Import UX Design workflow | 3 |
| P2 | MSSCI-12140 | Import Dev-Story workflow | 3 |
| P2 | MSSCI-12141 | Import Sprint Planning workflow | 2 |
| P2 | MSSCI-12142 | Import Retrospective workflow | 2 |
| P2 | MSSCI-12143 | Import Code Review workflow | 2 |
| P2 | MSSCI-12144 | Import Brainstorming workflow | 2 |
| P2 | MSSCI-12145 | Import Project Context workflow | 2 |
| P2 | MSSCI-12146 | BMAD compatibility validation suite | 3 |

## Testing Strategy

For each imported workflow:
1. **Migration test** - Script runs without error, generates valid YAML
2. **Schema validation** - Generated `workflow.yaml` passes Pennyfarthing schema
3. **Variable conversion** - All `{var-name}` converted to `{var_name}`
4. **Step enumeration** - `/workflow start <name>` lists correct steps
5. **Mode selection** - Tri-modal workflows correctly route to steps-c/v/e
6. **Gate behavior** - Gates pause for user approval at expected points
7. **Template output** - Workflow produces correct output file format

## Success Criteria

1. All 13 BMAD workflows imported and runnable
2. Variable syntax converted consistently
3. Tri-modal workflows work correctly
4. Gates behave as expected
5. BMAD users can run their workflows in Pennyfarthing unchanged
