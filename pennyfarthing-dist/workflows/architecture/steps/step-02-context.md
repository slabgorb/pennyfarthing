# Step 2: Context Analysis

<step-meta>
number: 2
name: context-analysis
gate: true
</step-meta>

## Purpose

Analyze the project context and identify architectural concerns that will shape the decision.

## Instructions

1. **Extract Technical Constraints** from the PRD:
   - Performance requirements (latency, throughput, scale)
   - Security and compliance requirements
   - Integration requirements with existing systems
   - Technology mandates or restrictions

2. **Map the Current Landscape**:
   - What systems already exist?
   - What are the integration points?
   - What patterns are already in use?

3. **Identify Key Concerns**:
   - Scalability needs
   - Reliability requirements
   - Maintainability considerations
   - Cost constraints

## Actions

- Read: `{planning_artifacts}/*prd*.md`
- Read: `**/project-context.md` (if exists)
- Grep: Search codebase for existing patterns

## Output

Add to session file:

```markdown
## Architecture Context

### Technical Constraints
- Performance: [requirements from PRD]
- Security: [requirements]
- Integration: [required touchpoints]

### Current Landscape
- Existing systems: [list]
- Patterns in use: [list]
- Tech stack: [languages, frameworks]

### Key Concerns
1. [Concern]: [Why it matters]
2. [Concern]: [Why it matters]
```

<!-- GATE -->

## Gate: Context Confirmation

Before proceeding, confirm the context analysis is complete:

- **[C] Continue** - Context is well understood, proceed to pattern selection
- **[R] Revise** - Need to gather more information or clarify constraints
