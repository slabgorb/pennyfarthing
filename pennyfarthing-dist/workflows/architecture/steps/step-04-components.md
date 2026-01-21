# Step 4: Component Design

<step-meta>
number: 4
name: component-design
gate: true
</step-meta>

## Purpose

Define the major components of the system and their responsibilities based on the selected patterns.

## Instructions

1. **Identify Components**:
   Based on the selected pattern(s), define the major building blocks:
   - What are the primary components/services?
   - What is each component responsible for?
   - What data does each component own?

2. **Define Boundaries**:
   - Where are the component boundaries?
   - What crosses each boundary?
   - How do components communicate?

3. **Map Dependencies**:
   - Which components depend on others?
   - Are there circular dependencies to avoid?
   - What is the deployment topology?

## Actions

- Design: Component diagram (can be ASCII or Mermaid)
- Document: Component responsibilities
- Validate: Boundaries align with domain concepts

## Output

Add to session file:

```markdown
## Component Design

### Component Diagram

\`\`\`
┌─────────────┐     ┌─────────────┐
│ Component A │────▶│ Component B │
└─────────────┘     └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│ Component C │     │ Component D │
└─────────────┘     └─────────────┘
\`\`\`

### Component Responsibilities

| Component | Responsibility | Data Owned | Dependencies |
|-----------|---------------|------------|--------------|
| [A] | [what it does] | [data] | [deps] |
| [B] | [what it does] | [data] | [deps] |

### Boundary Decisions
- [Boundary 1]: [What crosses, protocol]
- [Boundary 2]: [What crosses, protocol]
```

<!-- GATE -->

## Gate: Component Review

Before proceeding to interface definition, confirm:

- **[C] Continue** - Components are well-defined, boundaries are clear
- **[R] Revise** - Need to reconsider component structure or boundaries
