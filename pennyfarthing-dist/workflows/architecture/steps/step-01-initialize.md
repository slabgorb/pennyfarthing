# Step 1: Initialize Architecture Session

<step-meta>
number: 1
name: initialize
gate: false
</step-meta>

## Purpose

Set up the architecture decision session by gathering inputs and establishing context.

## Instructions

1. Verify that required inputs exist:
   - Product Requirements Document (PRD) or feature brief
   - Any existing architecture documentation
   - Relevant ADRs from `docs/adr/`

2. Create session workspace:
   - Output file: `{output_file}`
   - Working notes in session file

3. Identify stakeholders and constraints:
   - Who needs to approve this decision?
   - What are the timeline constraints?
   - Are there budget or resource limitations?

## Actions

- Read: `{planning_artifacts}/*prd*.md` or `{planning_artifacts}/*brief*.md`
- Read: `docs/adr/*.md` (scan for relevant prior decisions)
- Read: Existing architecture docs if referenced

## Output

Add to session file:

```markdown
## Architecture Session: {project_name}

### Inputs Gathered
- PRD: [path or "not found"]
- Existing ADRs: [list relevant ones]
- Constraints: [timeline, budget, resources]

### Stakeholders
- Decision maker: [name/role]
- Reviewers: [list]
```

## Next Step

Proceed to Context Analysis to understand the technical landscape.
