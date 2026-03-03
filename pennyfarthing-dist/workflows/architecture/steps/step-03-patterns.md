# Step 3: Pattern Selection

<purpose>
Identify and evaluate architectural patterns that address identified concerns with verification of current technology versions, trade-off analysis, and selection of patterns that best fit the project requirements.
</purpose>

<instructions>
Survey applicable patterns (microservices, event-driven, CQRS, circuit breakers, etc.) based on context concerns. Search web for current stable versions and best practices. Evaluate trade-offs (complexity, team familiarity, overhead, system fit). Select 1-3 primary patterns with rationale.
</instructions>

<output>
Pattern Analysis section with Technology Versions table, Candidate Patterns comparison, Selected Pattern(s) with justification, and Rejected Alternatives. Update frontmatter stepsCompleted array after user confirms via the switch prompt.
</output>

<step-meta>
number: 3
name: pattern-selection
gate: false
</step-meta>

## Mandatory Execution Rules

- READ the complete step file before taking any action
- SEARCH the web to verify current technology versions - NEVER trust hardcoded versions
- ALWAYS treat this as collaborative discovery between architectural peers
- FOCUS on evaluating patterns with up-to-date information

## Execution Protocols

- Show your analysis before taking any action
- Search the web to verify current versions and options
- Present the switch promptafter generating pattern analysis
- ONLY save when user confirms via the switch prompt
- Update frontmatter `stepsCompleted: [1, 2, 3]` before loading next step
- FORBIDDEN to load next step until user confirms via the switch prompt

## Purpose

Identify and evaluate architectural patterns that could address the identified concerns, with current technology verification.

## Instructions

1. **Survey Applicable Patterns**:
   Based on the context analysis, identify patterns that address the key concerns:
   - For scalability: microservices, event-driven, CQRS
   - For reliability: circuit breakers, bulkheads, retries
   - For maintainability: clean architecture, hexagonal, modular monolith
   - For integration: API gateway, message broker, service mesh

2. **Verify Current Versions** (web search):
   For any frameworks or technologies being considered:
   - What is the current stable version?
   - What are the recommended starter templates?
   - Are there breaking changes in recent releases?

3. **Evaluate Trade-offs**:
   For each candidate pattern, consider:
   - Complexity cost vs. benefit
   - Team familiarity
   - Operational overhead
   - Fit with existing systems

4. **Select Primary Pattern(s)**:
   Choose 1-3 patterns that best address the requirements.

## Actions

- Review: Architecture pattern references
- Search: Web for current framework versions and best practices
- Compare: Pattern fit against constraints from Step 2
- Document: Trade-off analysis

## Output

Add to session file:

```markdown
## Pattern Analysis

### Technology Versions (as of {date})
| Technology | Current Version | Notes |
|------------|-----------------|-------|
| [Tech 1] | [version] | [stability, LTS status] |
| [Tech 2] | [version] | [stability, LTS status] |

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

## Success Metrics

- Patterns evaluated against context constraints
- Current technology versions verified via web search
- Trade-offs clearly documented
- User confirmed pattern selection before proceeding

## Failure Modes

- Using outdated technology versions
- Not considering team familiarity
- Selecting overly complex patterns for simple problems
- Proceeding without user confirmation


<switch tool="AskUserQuestion">
  <case value="advanced-elicitation" next="LOOP">
    Advanced Elicitation — Use discovery protocols to explore unconventional patterns or custom approaches
  </case>
  <case value="party-mode" next="LOOP">
    Party Mode — Bring multiple perspectives to evaluate pattern trade-offs for different use cases
  </case>
  <case value="continue" next="step-04-components">
    Continue — Save the content and proceed to component design
  </case>
  <case value="revise" next="LOOP">
    Revise — Need to reconsider patterns or gather more information
  </case>
</switch>
