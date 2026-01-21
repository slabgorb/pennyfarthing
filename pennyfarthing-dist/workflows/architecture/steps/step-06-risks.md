# Step 6: Risk Assessment

<step-meta>
number: 6
name: risk-assessment
gate: true
</step-meta>

## Purpose

Identify technical risks, potential failure modes, and mitigation strategies.

## Instructions

1. **Identify Technical Risks**:
   - Performance bottlenecks
   - Single points of failure
   - Security vulnerabilities
   - Data consistency challenges
   - Operational complexity

2. **Assess Impact and Likelihood**:
   - What happens if this risk materializes?
   - How likely is it?
   - What's the blast radius?

3. **Define Mitigations**:
   - How can each risk be reduced or eliminated?
   - What monitoring/alerting is needed?
   - What's the fallback plan?

## Actions

- Analyze: Each component for failure modes
- Review: Security considerations
- Plan: Monitoring and alerting strategy

## Output

Add to session file:

```markdown
## Risk Assessment

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| [Risk 1] | High/Med/Low | High/Med/Low | [Strategy] |
| [Risk 2] | High/Med/Low | High/Med/Low | [Strategy] |

### Failure Modes

| Component | Failure Mode | Detection | Recovery |
|-----------|--------------|-----------|----------|
| [A] | [How it fails] | [Monitoring] | [Steps] |
| [B] | [How it fails] | [Monitoring] | [Steps] |

### Security Considerations
- [Authentication approach]
- [Authorization model]
- [Data protection measures]

### Operational Readiness
- Monitoring: [What to watch]
- Alerting: [Thresholds]
- Runbooks: [Key procedures needed]
```

<!-- GATE -->

## Gate: Risk Acceptance

Before finalizing the architecture, confirm risks are acceptable:

- **[C] Continue** - Risks are understood and mitigations are adequate
- **[R] Revise** - Need to address unacceptable risks before proceeding
