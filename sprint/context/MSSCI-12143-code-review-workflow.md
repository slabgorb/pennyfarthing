# Story MSSCI-12143: Import Code Review workflow - Technical Context

## Story Overview
- **Epic:** MSSCI-12131 - BikeLane BMAD Workflow Imports
- **Points:** 2
- **Priority:** Medium
- **Repos:** pennyfarthing
- **Workflow:** trivial (2 pts - SM → Dev)

## Current State

### BMAD Source Files
Located at `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/4-implementation/code-review/`:

| File | Size | Purpose |
|------|------|---------|
| `workflow.yaml` | 2.2KB | Workflow configuration with input_file_patterns |
| `instructions.xml` | 10.5KB | 5-step adversarial review process |
| `checklist.md` | 1.1KB | 21-item validation checklist |

### Key BMAD Features
1. **Adversarial Mindset:** Find 3-10 specific issues minimum - no "looks good" reviews
2. **Git-Story Cross-Reference:** Compare story claims vs actual git changes
3. **AC Validation:** Verify each Acceptance Criterion is actually implemented
4. **Task Audit:** Verify marked-complete tasks are really done
5. **Auto-Fix Option:** Can fix HIGH/MEDIUM issues or create action items
6. **Sprint Sync:** Updates sprint-status.yaml after review

### Existing Pennyfarthing Integration
- **Reviewer Agent:** `.pennyfarthing/agents/reviewer.md` - uses adversarial approach already
- **Code Review Skill:** `pennyfarthing-dist/skills/code-review/SKILL.md` - checklists and patterns
- **These coexist:** Skill for quick checks, BMAD workflow for full ceremony

## Technical Approach

### Files to Create
1. **`pennyfarthing-dist/workflows/code-review/workflow.yaml`**
   - Adapt BMAD schema to Pennyfarthing format
   - Type: `procedural` (single reviewer agent)
   - Remove BMAD-specific config references
   - Update path references

2. **`pennyfarthing-dist/workflows/code-review/instructions.md`**
   - Convert from XML format (preserve structure)
   - 5 steps: Load story, Build attack plan, Execute review, Present findings, Update status
   - Note: Keep XML structure for BMAD compatibility

3. **`pennyfarthing-dist/workflows/code-review/checklist.md`**
   - Copy from BMAD source
   - 21 validation items

### Key Differences from Brainstorming Import
- No CSV data file (unlike brain-methods.csv)
- Instructions are already in XML format (not multiple step files)
- Simpler import - mostly copying with path adjustments

### Pattern Reference
Follow `pennyfarthing-dist/workflows/brainstorming/` structure:
- workflow.yaml header comments explaining purpose
- Author: BMad
- Type: procedural
- Agent: reviewer

## Acceptance Criteria
- [ ] AC1: `pennyfarthing-dist/workflows/code-review/` directory created
- [ ] AC2: `workflow.yaml` follows Pennyfarthing schema (see brainstorming example)
- [ ] AC3: `instructions.md` contains full 5-step XML workflow
- [ ] AC4: `checklist.md` contains 21 validation items
- [ ] AC5: YAML parses correctly (`yq` validation)

## Testing Strategy
- Verify YAML syntax with `yq` or similar
- Visual inspection against BMAD source
- No functional tests required (trivial workflow, 2 pts)

## Dependencies
- Epic context: `sprint/context/context-epic-MSSCI-12131.md`
- Reference: `pennyfarthing-dist/workflows/brainstorming/` (completed MSSCI-12144)

## Risks
- **Low risk:** Straightforward file copy and adaptation
- **Note:** Instructions use XML syntax which is preserved as-is in markdown
