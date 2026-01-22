# Epic: BikeLane BMAD Workflow Imports (MSSCI-12131)

## Overview

Import all BMAD workflows into Pennyfarthing's BikeLane stepped workflow system. Goal: full BMAD compatibility for projects that use BMAD methodology.

## Technical Landscape

### Source Location
- **BMAD Repository:** `~/Projects/BMAD-METHOD/`
- **Workflow Sources:** `src/modules/bmm/workflows/` and `src/core/workflows/`
- **Output Reference:** `_bmad-output/` (processed BMAD outputs)

### Target Location
- **Pennyfarthing Workflows:** `pennyfarthing-dist/workflows/`
- **Each workflow is a directory containing:**
  - `workflow.yaml` - Configuration and metadata
  - `instructions.md` - Consolidated step instructions
  - `checklist.md` - Validation checklist
  - Additional assets (CSV files, templates, etc.)

### Workflow Types
| Type | Description |
|------|-------------|
| `procedural` | Single-agent facilitated workflow (e.g., brainstorming) |
| `stepped` | Multi-agent BikeLane workflow with phase transitions |
| `template` | Generates output artifacts |

### Key Patterns

1. **workflow.yaml Schema:**
   ```yaml
   workflow:
     name: workflow-name
     description: |
       BMAD reference workflow description...
     version: "1.0.0"
     type: procedural | stepped | template
     author: BMad
     agent: responsible-agent
     instructions: ./instructions.md
     checklist: ./checklist.md
     variables:
       project_root: .
       output_folder: ./artifacts
     triggers:
       types: [workflow-type-tags]
       tags: [discovery-tags]
   ```

2. **Instructions Consolidation:**
   - BMAD uses XML format with `<step>` elements
   - Pennyfarthing imports preserve XML structure in markdown
   - Multiple BMAD step files consolidated into single `instructions.md`

3. **Checklist Format:**
   - Markdown checkbox list
   - Validation steps for workflow completion
   - Reviewer: `{{user_name}} on {{date}}`

## Completed Stories

| Story | Title | Notes |
|-------|-------|-------|
| MSSCI-12138 | Import retrospective workflow | First import, established pattern |
| MSSCI-12144 | Import Brainstorming workflow | Procedural type, 60 techniques CSV |

## Remaining Stories

| Story | Title | Source |
|-------|-------|--------|
| MSSCI-12143 | Import Code Review workflow | `src/modules/bmm/workflows/4-implementation/code-review/` |
| MSSCI-12146 | BMAD compatibility validation suite | End-to-end validation |

## Integration Points

### With Reviewer Agent
The code-review workflow overlaps with Pennyfarthing's Reviewer agent:
- BMAD: Adversarial review with mandatory 3-10 issues minimum
- Pennyfarthing: Reviewer agent uses `/code-review` skill
- **Strategy:** Import as reference workflow for BMAD compatibility, Reviewer agent continues using native approach

### With Skills System
- `/code-review` skill already exists with checklists
- BMAD workflow provides more structured step-by-step approach
- Both can coexist - skill for quick checks, workflow for full BMAD ceremony

## Migration Checklist

When importing a workflow:
- [ ] Locate source in BMAD-METHOD repository
- [ ] Identify workflow type (procedural, stepped, template)
- [ ] Create directory in `pennyfarthing-dist/workflows/{name}/`
- [ ] Write `workflow.yaml` following established schema
- [ ] Consolidate instructions into `instructions.md` (preserve XML structure)
- [ ] Create `checklist.md` from validation criteria
- [ ] Copy any data files (CSV, templates)
- [ ] Verify YAML parses correctly
- [ ] Document in workflow catalog if needed
