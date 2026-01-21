# Step 3: Pattern Selection

<step-meta>
number: 3
name: pattern-selection
gate: false
</step-meta>

## Purpose

Identify and evaluate architectural patterns that could address the identified concerns.

## Instructions

1. **Survey Applicable Patterns**:
   Based on the context analysis, identify patterns that address the key concerns:
   - For scalability: microservices, event-driven, CQRS
   - For reliability: circuit breakers, bulkheads, retries
   - For maintainability: clean architecture, hexagonal, modular monolith
   - For integration: API gateway, message broker, service mesh

2. **Evaluate Trade-offs**:
   For each candidate pattern, consider:
   - Complexity cost vs. benefit
   - Team familiarity
   - Operational overhead
   - Fit with existing systems

3. **Select Primary Pattern(s)**:
   Choose 1-3 patterns that best address the requirements.

## Actions

- Review: Architecture pattern references
- Compare: Pattern fit against constraints from Step 2
- Document: Trade-off analysis

## Output

Add to session file:

```markdown
## Pattern Analysis

### Candidate Patterns

| Pattern | Addresses | Trade-offs | Fit Score |
|---------|-----------|------------|-----------|
| [Pattern 1] | [concerns] | [pros/cons] | [1-5] |
| [Pattern 2] | [concerns] | [pros/cons] | [1-5] |
| [Pattern 3] | [concerns] | [pros/cons] | [1-5] |

### Selected Pattern(s)
1. **[Primary pattern]**: [Why this fits best]
2. **[Secondary pattern]** (if needed): [Why]

### Rejected Alternatives
- [Pattern]: [Why not suitable]
```

## Next Step

Proceed to Component Design to define the system structure.
