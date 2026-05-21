# Tandem Consultation Protocol

Active request/response mechanism for structured agent-to-agent questions during workflow execution.

## Overview

Consultation differs from passive tandem observation (backseat):

| Aspect | Backseat (95-2) | Consultation (86-2) |
|--------|-----------------|---------------------|
| Mode | Passive observer | Active request/response |
| Trigger | Phase start (automatic) | Leader-initiated (on demand) |
| Model | Haiku | Sonnet (ADR-0012) |
| Output | Observation file | Structured recommendation |
| Lifecycle | Background process | Synchronous spawn + response |

## Request Format

Leader agent constructs a consultation request:

```markdown
**Leader:** {agent-name} ({character-name})
**Partner:** {partner-agent-name}
**Context:** {brief background for the question}
**Question:** {specific decision point}
**Alternatives Considered:**
- {option 1}
- {option 2}
**Relevant Code/Files:** {code snippets or file references}
**Token Budget:** {budget from workflow tandem.token_budget}
```

## Response Format

Partner responds with:

```markdown
**Recommendation:** {concise advice}
**Rationale:** {why this approach}
**Watch-Out-For:** {pitfalls or edge cases}
**Confidence:** {high|medium|low}
**Token Count:** {approximate tokens consumed}
```

## Workflow Integration

### When to Consult

A phase supports consultation when its workflow YAML includes a `tandem:` block with `mode: consultation`:

```yaml
phases:
  - name: green
    agent: dev
    tandem:
      partner: architect
      mode: consultation
      model: sonnet
      token_budget: 1000
```

### Spawn Mechanism

Leaders spawn the partner via the Task tool with `model: sonnet`:

```typescript
import {
  executeConsultation,
  type ConsultationAdapter,
} from './consultation-protocol.js';

const adapter: ConsultationAdapter = {
  spawn: async ({ prompt, model }) => {
    // Real implementation uses Task tool
    const result = await taskTool({ prompt, model, subagentType: 'general-purpose' });
    return { responseText: result.output };
  },
};

const result = await executeConsultation({
  request: { leader, leaderCharacter, partner, context, question, alternativesConsidered, relevantCode, tokenBudget },
  agentDefinition: partnerAgentMd,
  personaBlock: partnerPersonaBlock,
  adapter,
});

if (result.success) {
  // Use result.data.response.recommendation
} else if (result.degraded) {
  // Partner failed — continue solo, log result.error
}
```

### Graceful Degradation

If the partner spawn fails or returns an unparseable response, `executeConsultation` returns:

```typescript
{ success: false, degraded: true, error: "..." }
```

The leader **must not throw** — it continues working solo with a warning. Consultation is advisory, not blocking.

### Token Budget

- Budget is set in the workflow YAML `tandem.token_budget` field
- Included in the partner prompt as a hard instruction
- Response `tokenCount` is compared against budget; `overBudget: true` if exceeded
- Over-budget responses are still returned (advisory flag, not rejection)

## Module API

Source: `packages/core/src/consultation/consultation-protocol.ts`

| Function | Purpose |
|----------|---------|
| `formatConsultationRequest(request)` | Format request as structured markdown |
| `parseConsultationResponse(markdown)` | Parse partner response; returns null if unparseable |
| `validateConsultationRequest(request)` | Validate request completeness |
| `validateConsultationResponse(response)` | Validate response completeness |
| `buildPartnerPrompt(params)` | Build full prompt with agent def + persona + request + budget |
| `buildConsultationSpawnParams(request)` | Returns `{ model: 'sonnet', partner }` |
| `executeConsultation(params)` | Full flow: format → prompt → spawn → parse → result |
