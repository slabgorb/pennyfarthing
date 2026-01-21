# Step 7: Decision Documentation

<step-meta>
number: 7
name: documentation
gate: false
</step-meta>

## Purpose

Consolidate the architecture decision into a formal document (ADR or architecture spec).

## Instructions

1. **Compile Decision Record**:
   Gather outputs from all previous steps into a cohesive document:
   - Context and problem statement
   - Decision drivers (constraints, concerns)
   - Considered options
   - Decision outcome
   - Consequences

2. **Choose Document Type**:
   - **ADR**: For significant, reversible decisions
   - **Architecture Spec**: For system-wide design
   - **Design Doc**: For feature-level architecture

3. **Finalize and Store**:
   - Write to appropriate location
   - Link from session/story
   - Update architecture index if exists

## Actions

- Write: Architecture document using template
- Store: In `docs/adr/` or `docs/architecture/`
- Update: Any architecture index or registry

## Output

Create `{output_file}` using the template, containing:

```markdown
# ADR-NNNN: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** {date}
**Author:** {agent} ({persona})

## Context

[Summary from Step 2 - Context Analysis]

## Decision Drivers

[Key concerns from Step 2]

## Considered Options

[Patterns from Step 3 with trade-offs]

## Decision Outcome

[Selected pattern(s) and rationale]

### Component Structure

[From Step 4]

### Interfaces

[From Step 5]

## Consequences

### Positive
- [Benefits]

### Negative
- [Trade-offs accepted]

### Risks and Mitigations
[From Step 6]

## Related Decisions

- [Links to related ADRs]
```

## Completion

The architecture workflow is complete. The decision document is ready for review.

**Next steps:**
1. Review document with stakeholders
2. Update status to "Accepted" after approval
3. Begin implementation planning
