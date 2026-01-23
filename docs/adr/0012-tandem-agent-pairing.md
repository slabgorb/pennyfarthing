# ADR-0012: Tandem Agent Pairing

**Status:** Proposed
**Date:** 2026-01-23
**Author:** Architect (Emperor Palpatine)

## Context

Current Pennyfarthing workflows are strictly sequential: SM → TEA → Dev → Reviewer. Each agent works in isolation, passing artifacts through session files and handoff protocols. While this provides clear boundaries and state management, it misses opportunities for real-time collaboration between agents with complementary expertise.

**Problem statement:** Complex stories (8+ points, architectural decisions, cross-cutting concerns) would benefit from specialists consulting each other during work, not just at handoff boundaries.

**Examples:**
- Dev implementing a complex feature could consult Architect on design decisions
- TEA writing tests could ask Dev about implementation constraints
- Reviewer could get Architect's perspective on architectural patterns

Currently, getting this input requires:
1. Completing the current phase
2. Handing off to the specialist
3. Getting feedback
4. Returning to original work
5. Resuming with lost context

## Decision

Extend the BikePath workflow system to support **tandem agent pairing** within a single phase. A leader agent can invoke a partner agent for consultation without exiting their current phase.

### Core Concepts

| Term | Definition |
|------|------------|
| **Leader** | Primary agent responsible for the phase output |
| **Partner** | Specialist agent providing consultation |
| **Tandem** | A leader-partner pairing during a phase |
| **Consultation** | Structured request/response exchange |
| **Dialogue** | Persistent record of exchanges |

### Workflow Schema Extension

Existing phase definition:
```yaml
phases:
  - name: green
    agent: dev
    input: [failing_tests]
    output: [implementation]
```

Extended with tandem support:
```yaml
phases:
  - name: green
    agent: dev
    input: [failing_tests]
    output: [implementation]
    tandem:
      partner: architect
      mode: consultation
      triggers:
        - request: true
        - complexity: high
```

### Tandem Modes

| Mode | Behavior | Token Cost | Use Case |
|------|----------|------------|----------|
| `consultation` | Leader spawns partner on-demand with specific questions | Low | Default - explicit invocation |
| `co-pilot` | Partner receives continuous updates, can interject | High | Future - real-time collaboration |
| `review-forward` | Partner reviews work at defined checkpoints | Medium | Future - architectural oversight |

**Phase 1 implements `consultation` mode only.**

### Trigger Conditions

| Trigger | Behavior |
|---------|----------|
| `request: true` | Partner available when leader explicitly asks |
| `complexity: high` | Auto-prompt for consultation on complex stories |
| `always: true` | Partner consulted at phase start (rare) |

**Default:** `triggers.request: true` - leader controls invocation.

## Consultation Protocol

### Request Format

```markdown
## Consultation Request

**Story:** {story_id}
**From:** {leader_agent} → **To:** {partner_agent}
**Urgency:** {blocking | informational}

### Context
{2-3 sentence summary of current work state}

### Question
{Specific, focused question - one question per consultation}

### Options Considered
1. {Option A} - {brief pro/con}
2. {Option B} - {brief pro/con}

### Relevant Code (optional)
```{language}
{code snippet if applicable}
```
```

### Response Format

```markdown
## Consultation Response

### Recommendation
{Direct answer to the question}

### Rationale
{Why this recommendation - max 200 words}

### Watch Out For
- {Risk or concern 1}
- {Risk or concern 2}

### Confidence
{high | medium | low} - {brief explanation if not high}
```

### Invocation Pattern

Leader spawns partner as a Haiku subagent:

```yaml
Task tool:
  subagent_type: "general-purpose"
  model: "haiku"
  prompt: |
    You are {partner_agent} providing consultation to {leader_agent}.

    Your expertise: {partner_specialty}

    Read the consultation request below and respond using the
    Consultation Response format. Be concise and actionable.
    Focus only on the specific question asked.

    ## Consultation Request
    {formatted_request_markdown}

    Respond with the Consultation Response format only.
```

**Partner uses Haiku model** per ADR-0007 (mechanical task, focused response).

## Dialogue File Format

All tandem exchanges are recorded in a dialogue file for context and audit.

**Location:** `.session/{story-id}-dialogue.md`

**Format:**

```markdown
# Tandem Dialogue: {story-id}

**Workflow:** {workflow-name}
**Leader:** {agent} | **Partner:** {agent}
**Started:** {ISO timestamp}

---

## Exchange 1
**[{HH:MM}] {Leader} → {Partner}**

> {Question summary}

**[{HH:MM}] {Partner}:**

{Response summary}

**Outcome:** {applied | deferred | rejected} - {brief note}

---

## Exchange 2
...

---

## Summary
- **Total exchanges:** {N}
- **Key decisions:** {bulleted list}
- **Time in tandem:** {duration}
```

**Lifecycle:**
1. Created on first consultation in a phase
2. Appended with each exchange
3. Archived alongside session file on story completion

## Example Workflow

```yaml
# pennyfarthing-dist/workflows/tdd-tandem.yaml
workflow:
  name: tdd-tandem
  description: TDD with architect consultation on complex stories
  version: "1.0.0"

  phases:
    - name: setup
      agent: sm
      output: [session_file, branches, story_context]

    - name: red
      agent: tea
      input: [session_file, story_context]
      output: [failing_tests]
      tandem:
        partner: architect
        mode: consultation
        triggers:
          - request: true

    - name: green
      agent: dev
      input: [failing_tests, story_context]
      output: [implementation, passing_tests]
      tandem:
        partner: architect
        mode: consultation
        triggers:
          - complexity: high
          - request: true

    - name: review
      agent: reviewer
      input: [implementation, passing_tests]
      output: [approval]

    - name: finish
      agent: sm
      input: [approval]
      output: [archived_session, dialogue_archive]

  triggers:
    types: [feature]
    points:
      min: 5
    tags: [complex, architectural]
```

## High-Value Pairings

| Pairing | Use Case | Benefit |
|---------|----------|---------|
| **Dev + Architect** | Complex implementation | Design decisions during coding |
| **TEA + Dev** | Tricky algorithms | Test coverage for edge cases |
| **PM + Architect** | Epic scoping | Feasibility-checked requirements |
| **Reviewer + Architect** | Security-critical code | Architectural pattern validation |
| **Dev + DevOps** | Infrastructure features | Deploy-aware implementation |

## Consequences

### Positive

- **Faster feedback** - Get specialist input without phase transitions
- **Preserved context** - Leader maintains working state during consultation
- **Reduced rework** - Architectural issues caught during implementation, not review
- **Explicit knowledge transfer** - Dialogue file documents decision rationale
- **Low overhead** - Haiku partner keeps token cost reasonable
- **Workflow control** - Pairing defined in workflow, not ad-hoc

### Negative

- **Increased complexity** - Workflows now have optional tandem configuration
- **Token cost increase** - ~20% more tokens for stories using consultation
- **Potential over-consultation** - Risk of leader asking too many questions
- **Partner context limitation** - Partner only sees snapshot, not full history

### Mitigation

| Risk | Mitigation |
|------|------------|
| Over-consultation | Default to `request: true` trigger (explicit invocation) |
| Token bloat | Partner uses Haiku; consultation responses capped at 200 words |
| Dialogue noise | Summary section distills key decisions |
| Partner staleness | Leader includes current context in each request |

## Future Phases

### Phase 2: Cyclist Integration

WheelHub routes real-time communication between sessions:

```
┌─────────────────────────────────────────┐
│            WheelHub (Cyclist)           │
│                                         │
│  ┌─────────┐  tandem   ┌─────────────┐  │
│  │ Leader  │◄─channel─►│  Partner    │  │
│  │ Session │           │  Session    │  │
│  └────┬────┘           └──────┬──────┘  │
│       └───────────────────────┘         │
│           Shared Dialogue               │
└─────────────────────────────────────────┘
```

Enables `co-pilot` mode with bidirectional communication.

### Phase 3: Multi-Partner

Allow multiple partners in a single phase:

```yaml
tandem:
  partners:
    - agent: architect
      focus: design
    - agent: devops
      focus: deployment
  mode: consultation
```

## Alternatives Considered

### 1. Ping-Pong TDD (Rejected)

Alternate between TEA and Dev for each test/implementation cycle.

**Rejected:** High handoff overhead for AI agents. Each switch loses context and costs tokens. Sequential phases with occasional consultation is more efficient.

### 2. Persistent Background Partner (Deferred)

Partner runs continuously, monitoring leader's work.

**Deferred:** Complex orchestration, high token cost. Revisit after `consultation` mode proves value.

### 3. Human as Router (Rejected)

User manually relays messages between agents.

**Rejected:** Defeats purpose of automation. User should focus on decisions, not message passing.

### 4. Shared Memory / RAG (Deferred)

Agents share a vector store for context.

**Deferred:** Infrastructure complexity. File-based dialogue is simpler and sufficient for Phase 1.

## Implementation Guidance

### For Workflow Engine

1. Parse `tandem` block in phase definitions
2. Make partner availability visible to leader agent
3. No automatic invocation - leader decides when to consult
4. Track consultation count for metrics

### For Leader Agents

1. Check if tandem partner is configured for current phase
2. Format consultation request using protocol template
3. Spawn partner as Haiku subagent with request
4. Parse response, append to dialogue file
5. Continue work with recommendation

### For Partner Agents

1. Read consultation request
2. Respond in protocol format only
3. Keep response focused and actionable
4. Indicate confidence level

### File Changes Required

| File | Change |
|------|--------|
| `pennyfarthing-dist/workflows/*.yaml` | Add `tandem` blocks to phases |
| `pennyfarthing-dist/protocols/tandem-consultation.md` | New - protocol documentation |
| `pennyfarthing-dist/agents/*.md` | Add tandem consultation guidance |
| `.session/{story}-dialogue.md` | New file type - dialogue record |

## References

- [ADR-0007: Subagent Delegation Model](./0007-subagent-delegation-model.md) - Haiku for mechanical tasks
- [ADR-0009: Session File Coordination](./0009-session-file-coordination.md) - Session file patterns
- Brainstorm session 2026-01-23: Tandem Bike concept exploration
