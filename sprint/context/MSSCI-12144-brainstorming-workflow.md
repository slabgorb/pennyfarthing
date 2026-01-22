# MSSCI-12144: Import Brainstorming Workflow

## Story Context

**Epic:** MSSCI-12131 - BikeLane BMAD Workflow Imports
**Points:** 2 (trivial - skip TEA)
**Type:** Feature import

## Objective

Import the BMAD brainstorming workflow into Pennyfarthing's BikeLane system. This workflow provides structured creative ideation with 40 brainstorming techniques.

## BMAD Source Location

```
~/Projects/BMAD-METHOD/src/core/workflows/brainstorming/
├── workflow.md              # Main workflow definition
├── brain-methods.csv        # 40 brainstorming techniques (16KB)
├── template.md              # Output template with frontmatter
└── steps/
    ├── step-01-session-setup.md      # Initialize session
    ├── step-01b-continue.md          # Handle continuation
    ├── step-02a-user-selected.md     # User selects technique
    ├── step-02b-ai-recommended.md    # AI recommends technique
    ├── step-02c-random-selection.md  # Random selection
    ├── step-02d-progressive-flow.md  # Progressive flow
    ├── step-03-technique-execution.md # Execute technique
    └── step-04-idea-organization.md  # Organize results
```

## Target Location

```
pennyfarthing-dist/workflows/brainstorming/
├── workflow.yaml        # Pennyfarthing schema
├── instructions.md      # Consolidated step instructions
├── checklist.md         # Definition of Done
└── brain-methods.csv    # Copy of technique database
```

## Key Features to Preserve

1. **40 brainstorming techniques** - From CSV with categories:
   - collaborative, creative, deep, introspective_delight, structured, theatrical

2. **Anti-bias protocol** - Semantic domain shifting every 10 ideas

3. **Quantity goal** - 100+ ideas before organization phase

4. **Four technique selection modes:**
   - User-selected (step-02a)
   - AI-recommended (step-02b)
   - Random selection (step-02c)
   - Progressive flow (step-02d)

5. **Session continuation** - FrontMatter state tracking with `stepsCompleted` array

## Reference Patterns

### Recently Imported Workflow (Retrospective)
- Location: `pennyfarthing-dist/workflows/retrospective/`
- Pattern: workflow.yaml + instructions.md + checklist.md
- Type: `procedural` (single agent)

### Command File
- Already renamed: `pennyfarthing-dist/commands/brainstorming.md`
- No changes needed - provides simplified interface

## Implementation Steps

1. Create `pennyfarthing-dist/workflows/brainstorming/` directory
2. Write `workflow.yaml` with procedural type, PM agent
3. Consolidate 8 step files into `instructions.md` with XML structure
4. Copy `brain-methods.csv` for technique database
5. Create `checklist.md` with Definition of Done
6. Test workflow loads via `/workflow list`

## Schema

```yaml
workflow:
  name: brainstorming
  description: BMAD brainstorming workflow with 40 creative techniques
  version: "1.0.0"
  type: procedural
  author: BMad
  agent: pm  # Or facilitator role
  instructions: ./instructions.md
  checklist: ./checklist.md
  variables:
    project_root: .
    output_folder: ./artifacts
    techniques_csv: ./brain-methods.csv
  triggers:
    types: [brainstorm, ideation, creative]
    tags: [bmad, reference, procedural, brainstorming]
```

## Acceptance Criteria

- [ ] Workflow directory created with all required files
- [ ] `brain-methods.csv` imported with 40 techniques
- [ ] `/workflow list` shows brainstorming workflow
- [ ] `/workflow start brainstorming` loads instructions correctly
- [ ] All 4 technique selection modes documented in instructions

## Files to Create/Modify

| Action | File |
|--------|------|
| CREATE | `pennyfarthing-dist/workflows/brainstorming/workflow.yaml` |
| CREATE | `pennyfarthing-dist/workflows/brainstorming/instructions.md` |
| CREATE | `pennyfarthing-dist/workflows/brainstorming/checklist.md` |
| COPY   | `pennyfarthing-dist/workflows/brainstorming/brain-methods.csv` |
| DONE   | `pennyfarthing-dist/commands/brainstorming.md` (renamed from brainstorm.md) |

## Definition of Done

1. Workflow loads without error
2. CSV file included with all 40 techniques
3. Instructions cover all 8 step files
4. Checklist validates brainstorming output quality
