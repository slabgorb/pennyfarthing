---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
status: completed
completedAt: '2026-01-23'
inputDocuments:
  - docs/adr/0012-tandem-agent-pairing.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 1
  projectDocs: 1
workflowType: 'prd'
mode: 'create'
startedAt: '2026-01-23'
outputFile: 'artifacts/prd-tandem.md'
classification:
  projectType: agent_collaboration_protocol
  domain: developer_tooling_ai_agent_systems
  complexity: medium-high
  projectContext: brownfield
---

# Product Requirements Document: Tandem Agent Pairing

**Author:** Jedi
**Date:** 2026-01-23
**Project Type:** Agent Collaboration Protocol
**Context:** Brownfield - extending Pennyfarthing workflow system

---

## Executive Summary

Enable specialist agent pairing within Pennyfarthing workflow phases, allowing a leader agent to consult a partner agent without exiting their current work. This establishes a protocol for agent-to-agent collaboration that reduces rework and improves outcomes.

---

## Project Classification

| Attribute | Value |
|-----------|-------|
| Project Type | Agent Collaboration Protocol |
| Domain | Developer Tooling / AI Agent Systems |
| Complexity | Medium-High |
| Context | Brownfield - extending BikeLane workflow system |

---

## Success Criteria

### User Success

- **Flow Preservation:** Leader agent gets specialist input without losing context or exiting their phase
- **Faster Resolution:** Design questions answered in one consultation cycle, not a full handoff loop
- **Confidence:** Dev proceeds with implementation knowing the approach is Architect-validated
- **Reduced Friction:** Asking for help feels natural, not bureaucratic

### Business Success

- **Adoption:** Tandem pairing used on majority of 5+ point stories within 2 sprints of launch
- **Rework Reduction:** Measurable decrease in reviewer comments requiring architectural changes
- **Efficiency:** Stories with tandem pairing complete with fewer phase-to-phase loops
- **Knowledge Capture:** Dialogue files create reusable decision records

### Technical Success

- **Token Efficiency:** Consultation overhead stays under 25% of baseline story token cost
- **Workflow Integration:** `tandem:` blocks work in any BikeLane workflow without special handling
- **Reliability:** Consultation failures gracefully degrade (leader continues solo)
- **Auditability:** All exchanges persisted in dialogue files

### Measurable Outcomes

| Metric | Target |
|--------|--------|
| Architectural rework in review | Reduce by 50% on tandem-enabled stories |
| Consultation response time | < 30 seconds per exchange |
| Token overhead | < 25% increase per story |
| Adoption rate | > 60% of eligible stories within 2 sprints |

---

## Product Scope

### MVP - Minimum Viable Product

**Scope: Broader MVP - Abstract from Day One**

1. **Workflow Schema Extension**
   - `tandem:` block supported in any BikeLane workflow phase
   - `partner:` specifies any agent (not limited to specific pairings)
   - `mode: consultation` (only mode in MVP)
   - `triggers:` supports `request: true` and `complexity: high`

2. **Consultation Protocol**
   - Structured request/response format
   - Leader spawns partner as Haiku subagent
   - Partner responds with recommendation, rationale, confidence

3. **Dialogue File**
   - `.session/{story}-dialogue.md` created on first consultation
   - All exchanges logged with timestamps and outcomes
   - Archived with session on story completion

4. **Integration**
   - Works with existing TDD, trivial, and custom workflows
   - No changes to agent activation or handoff protocols

### Growth Features (Post-MVP)

- **Co-pilot Mode:** Partner receives continuous context, can interject
- **Review-forward Mode:** Partner reviews at checkpoints, not just on-demand
- **Multi-partner:** Multiple specialists available in single phase
- **Tandem Metrics:** Dashboard showing consultation patterns, value delivered
- **Smart Triggers:** Auto-suggest consultation based on code complexity signals

### Vision (Future)

- **Learning System:** Track which consultations led to better outcomes, improve recommendations
- **Cross-session Memory:** Partner remembers previous consultations on similar topics
- **Real-time Cyclist UI:** Split-screen tandem view with live collaboration
- **Team Patterns:** Org-level configuration for preferred pairings

---

## User Journeys

### Journey 1: Keith, the Complex Feature Developer

**Persona:** Keith is an experienced Pennyfarthing user working on an 8-point story. He's implementing a new webhook handler and hits a design question mid-implementation.

**Opening Scene:** Keith is in a Dev session. Yoda (Dev agent) is implementing webhook handling. The code is taking shape, but a question emerges: "Should this handler be synchronous or queue the work asynchronously?"

**Rising Action:**
- Dev recognizes this is an architectural decision, not just implementation
- Dev sees tandem pairing is available (`tandem: partner: architect` in this workflow)
- Dev initiates consultation: "Architect, sync or async for webhook handling?"
- Consultation request fires - Architect (Palpatine) receives the context
- Within 15 seconds, response arrives: "Async. Queue the work, ack immediately. Webhook sources timeout at 30s."

**Climax:** Keith sees the recommendation appear in Dev's output. The rationale makes sense. Dev continues implementing with the async pattern, confidence high.

**Resolution:** The story completes. Reviewer (Obi-Wan) sees the dialogue file showing the consultation. No architectural feedback needed - the decision was made correctly during implementation. Keith thinks: "That would have been a rework if I'd guessed wrong."

---

### Journey 2: Sarah, the New Pennyfarthing User

**Persona:** Sarah just started using Pennyfarthing. She's on her second story - a 5-point feature. She doesn't know tandem pairing exists.

**Opening Scene:** Sarah is watching Dev implement her feature. The agent pauses and says: "I have an architectural question. Consulting Architect for guidance..."

**Rising Action:**
- Sarah is surprised - she didn't know agents could do this
- She watches the consultation happen in real-time
- The dialogue appears in the session: question, response, outcome
- Dev continues, incorporating the recommendation

**Climax:** Sarah realizes the system is smarter than she thought. Agents aren't just following a script - they're collaborating to get better outcomes.

**Resolution:** Sarah finishes the story with fewer review comments than her first attempt. She starts looking for the `tandem:` configuration in workflows, curious how to use it more intentionally.

---

### Journey 3: Marcus, the Workflow Designer

**Persona:** Marcus maintains custom BikeLane workflows for his team. He wants to add tandem pairing to their architecture-heavy workflow.

**Opening Scene:** Marcus opens his team's `feature-complex.yaml` workflow. He's heard about tandem pairing and wants to enable Dev + Architect pairing on implementation phases.

**Rising Action:**
- Marcus reads the workflow schema documentation
- He adds `tandem:` block to the `green` phase
- He configures `partner: architect`, `mode: consultation`, `triggers: [request: true, complexity: high]`
- He tests on a sample story

**Climax:** The first story runs through. Dev automatically consults Architect when hitting a design question. Marcus sees the dialogue file created and archived.

**Resolution:** Marcus rolls out the updated workflow to his team. Stories start showing consultation patterns. Reviewer feedback drops. Marcus thinks: "This was easier to configure than I expected."

---

### Journey 4: Alex, Troubleshooting a Bad Consultation

**Persona:** Alex is debugging why a story went sideways. The implementation followed a consultation recommendation, but it was wrong.

**Opening Scene:** A story completed but the feature has a bug. Alex looks at the dialogue file to understand what happened.

**Rising Action:**
- Alex reads the consultation exchange
- The question was good: "Should we cache this response?"
- The recommendation was "Yes, cache for 5 minutes"
- But the data changes every 30 seconds - caching caused stale data

**Climax:** Alex realizes the consultation lacked context. Dev didn't mention the data freshness requirement. The recommendation was reasonable given the incomplete question.

**Resolution:** Alex updates the consultation guidelines: "Always include data freshness requirements when asking about caching." The dialogue file made debugging possible - without it, the source of the bad decision would be invisible.

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---------|----------------------|
| **Keith (Complex Feature)** | Consultation protocol, dialogue display, async response, confidence signal |
| **Sarah (New User)** | Transparent consultation, session visibility, learning from agents |
| **Marcus (Workflow Designer)** | Schema extension, workflow configuration, testing tandem |
| **Alex (Troubleshooting)** | Dialogue persistence, audit trail, debugging support |

---

## Domain-Specific Requirements

### AI Agent Systems Constraints

| Concern Area | Requirement |
|--------------|-------------|
| **Token Economics** | Consultation overhead must stay under 25% of baseline story cost |
| **Context Limits** | Partner context injection limited to essential information |
| **Model Reliability** | Partner provides confidence signals with recommendations |
| **Latency** | Consultation response within 30 seconds |

### Pennyfarthing Integration Constraints

| Constraint | Requirement |
|------------|-------------|
| **BikeLane Compatibility** | `tandem:` block follows existing workflow schema patterns |
| **Session File Conventions** | Dialogue files follow `.session/` archival patterns |
| **Agent Activation Protocol** | Partner spawning does not interfere with leader activation |
| **Subagent Model** | Partner uses Haiku per ADR-0007 (cost efficiency) |

### Domain-Specific Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Token bloat | Cap consultation responses at 200 words; track overhead metrics |
| Bad advice | Confidence signals required; dialogue audit trail for debugging |
| Over-consultation | Default trigger is `request: true` (explicit invocation only) |
| Partner context staleness | Leader includes current work state in each consultation request |
| Workflow complexity | MVP includes `consultation` mode only; defer co-pilot to Growth |

---

## Innovation & Novel Patterns

### Detected Innovation Areas

**Core Innovation:** Establishing a protocol for agent-to-agent collaboration within workflow phases, moving beyond sequential handoffs to real-time specialist consultation.

| Innovation Aspect | Description |
|------------------|-------------|
| **Mid-Phase Consultation** | Agents can get specialist input without exiting their current phase |
| **Structured Protocol** | Formal request/response format ensures quality consultation |
| **Dialogue Persistence** | Exchanges become reusable knowledge artifacts |
| **Workflow-Level Configuration** | Pairing relationships defined declaratively in BikeLane |

### Assumption Being Challenged

**Old Assumption:** "Agents must complete their phase before getting input from other specialists."

**New Paradigm:** "Agents can collaborate in real-time while maintaining clear ownership and accountability."

### Market Context & Competitive Landscape

| System | Approach | Tandem Difference |
|--------|----------|-------------------|
| Single-agent systems (ChatGPT, Claude) | One agent, user provides all context | Multiple specialists, structured collaboration |
| Sequential multi-agent (AutoGen, CrewAI) | Agents hand off complete artifacts | Agents collaborate mid-work, preserve context |
| Swarm systems | Parallel agents, eventual merge | Structured leader-partner relationship |

**Tandem's unique position:** Combines the accountability of sequential workflows with the flexibility of real-time collaboration.

### Validation Approach

| Metric | Baseline | Target | Validation Method |
|--------|----------|--------|-------------------|
| Architectural rework | Current reviewer feedback rate | 50% reduction | Compare tandem vs non-tandem stories |
| Decision quality | Subjective (no baseline) | Dialogue files show sound reasoning | Audit dialogue files post-completion |
| Developer confidence | No baseline | Self-reported improvement | User feedback after tandem stories |

### Risk Mitigation

| Risk | Mitigation | Fallback |
|------|------------|----------|
| Innovation doesn't deliver value | Measure rework reduction empirically | Disable tandem, revert to sequential |
| Protocol too rigid | Start simple, iterate based on usage | Relax protocol constraints |
| Token cost exceeds benefit | Track overhead per story | Adjust response caps or trigger thresholds |

---

## Agent Collaboration Protocol - Technical Requirements

### Project-Type Overview

Tandem Agent Pairing is a BikeLane workflow extension that adds agent-to-agent consultation capabilities. It follows existing BikeLane patterns (YAML-based configuration) and integrates with the Pennyfarthing agent ecosystem.

### Protocol Specification

| Aspect | Specification |
|--------|---------------|
| Configuration Format | YAML (consistent with BikeLane) |
| Internal Protocol | Markdown-based request/response (human-readable in dialogue files) |
| Dialogue Persistence | Markdown at `.session/{story}-dialogue.md` |

### Workflow Schema Extension

```yaml
phases:
  - name: green
    agent: dev
    tandem:
      partner: architect
      mode: consultation
      model: haiku
      token_budget: 1000
      triggers:
        - request: true
        - complexity: high
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `partner` | string | required | Agent to consult |
| `mode` | string | `consultation` | Collaboration mode (MVP: consultation only) |
| `model` | string | `haiku` | Model for partner agent |
| `token_budget` | integer | `1000` | Maximum tokens for partner response |
| `triggers` | list | `[request: true]` | When consultation is available |

### Testing Requirements

**MVP: Unit Tests Only**

| Test Area | Coverage |
|-----------|----------|
| Protocol parsing | Request/response format validation |
| Schema validation | `tandem:` block YAML parsing |
| Dialogue file | Creation, appending, formatting |
| Configuration | Model and token_budget handling |

### Documentation Requirements

| Document | Audience | Content |
|----------|----------|---------|
| Agent Developer Guide | Agent authors | Making agents tandem-aware; initiating consultations; parsing responses |
| Workflow Author Guide | Workflow designers | Configuring `tandem:` blocks; choosing partners; setting budgets |
| End-User Guide | Pennyfarthing users | What tandem pairing looks like; reading dialogue files |

### Implementation Considerations

| Consideration | Approach |
|---------------|----------|
| Backward Compatibility | Workflows without `tandem:` work unchanged |
| Graceful Degradation | If partner fails, leader continues solo with warning |
| Token Tracking | Log consultation tokens separately for overhead analysis |
| Model Override | `model` in workflow overrides default Haiku |

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP - solves a real pain point (rework from missing specialist input) with minimum features to validate the hypothesis.

**Core User Journeys Supported:**
- Keith (Complex Feature Developer) - full consultation flow
- Sarah (New User) - transparent consultation visibility
- Marcus (Workflow Designer) - configuration and testing

### MVP Feature Set (Phase 1)

| Capability | Priority |
|------------|----------|
| `tandem:` workflow schema extension | Must-have |
| Consultation protocol (request/response) | Must-have |
| Dialogue file persistence | Must-have |
| Haiku partner invocation | Must-have |
| `model` + `token_budget` configuration | Must-have |
| Unit test coverage | Must-have |
| Agent Developer Guide | Must-have |
| Workflow Author Guide | Must-have |
| End-User Guide | Must-have |

### Post-MVP Features

**Phase 2 (Growth):**
- Co-pilot mode (continuous context sharing)
- Review-forward mode (checkpoint reviews)
- Cyclist UI: tandem status in sidebar
- Integration and E2E tests
- Tandem metrics dashboard
- Smart triggers (complexity-based auto-consultation)

**Phase 3 (Vision):**
- Multi-partner support (multiple specialists per phase)
- Cross-session memory (partner recalls previous consultations)
- Real-time Cyclist split-screen UI
- Learning system (track successful consultation patterns)
- Team-level pairing configurations

### Risk Mitigation Strategy

| Risk Type | Risk | Mitigation |
|-----------|------|------------|
| Technical | Protocol too rigid | Start simple, iterate based on usage patterns |
| Technical | Token overhead exceeds budget | `token_budget` config; track actual overhead |
| Market | Users don't see value | Measure rework reduction; gather feedback |
| Resource | MVP takes longer | Tight scope; can defer docs if needed |

---

## Functional Requirements

### Workflow Configuration

- **FR1:** Workflow author can add a `tandem:` block to any BikeLane workflow phase
- **FR2:** Workflow author can specify which agent serves as `partner` for consultation
- **FR3:** Workflow author can set `mode` to `consultation` (MVP: only mode available)
- **FR4:** Workflow author can specify `model` for the partner agent
- **FR5:** Workflow author can set `token_budget` to limit partner response length
- **FR6:** Workflow author can define `triggers` that control when consultation is available
- **FR7:** Workflows without `tandem:` blocks continue to work unchanged

### Consultation Protocol

- **FR8:** Leader agent can initiate a consultation request to partner agent
- **FR9:** Leader agent can include context summary in consultation request
- **FR10:** Leader agent can specify the question being asked
- **FR11:** Leader agent can list options being considered
- **FR12:** Partner agent can provide a recommendation in response
- **FR13:** Partner agent can provide rationale for the recommendation
- **FR14:** Partner agent can indicate confidence level (high/medium/low)
- **FR15:** Partner agent can flag risks or concerns ("watch out for")

### Dialogue Management

- **FR16:** System can create a dialogue file when first consultation occurs in a story
- **FR17:** System can append each consultation exchange to the dialogue file
- **FR18:** System can record timestamps for each exchange
- **FR19:** System can record outcome status (applied/deferred/rejected) for exchanges
- **FR20:** System can archive dialogue file with session on story completion
- **FR21:** User can read dialogue file to understand consultation history

### Partner Invocation

- **FR22:** Leader agent can spawn partner as a Haiku subagent
- **FR23:** Leader agent can inject relevant context into partner prompt
- **FR24:** Partner agent can respond within configured token budget
- **FR25:** System can track consultation token usage separately from main work

### Error Handling

- **FR26:** Leader agent can continue solo if partner invocation fails
- **FR27:** System can log warning when partner consultation fails
- **FR28:** System can report consultation success/failure in session

### Trigger Evaluation

- **FR29:** System can evaluate `request: true` trigger (explicit leader request)
- **FR30:** System can evaluate `complexity: high` trigger (story marked complex)
- **FR31:** Leader agent can check if tandem partner is available for current phase

### Documentation

- **FR32:** Agent developer can read guide on making agents tandem-aware
- **FR33:** Workflow author can read guide on configuring `tandem:` blocks
- **FR34:** End user can read guide on understanding tandem pairing in sessions

---

## Non-Functional Requirements

### Performance

- **NFR1:** Consultation response completes within 30 seconds of request
- **NFR2:** Dialogue file append operation completes within 500ms
- **NFR3:** Workflow schema parsing adds <100ms to phase initialization
- **NFR4:** Token budget enforcement does not add perceptible latency

### Integration

- **NFR5:** `tandem:` blocks validate against BikeLane workflow schema
- **NFR6:** Partner invocation uses standard Claude Code Task tool API
- **NFR7:** Dialogue files follow `.session/` directory conventions
- **NFR8:** Session archival includes dialogue files without modification
- **NFR9:** Configuration properties (`model`, `token_budget`) parse from YAML without custom handlers

### Reliability

- **NFR10:** Partner invocation failure does not crash leader agent session
- **NFR11:** Leader agent continues work within 5 seconds of partner failure
- **NFR12:** Partial dialogue file writes do not corrupt existing exchanges
- **NFR13:** Network timeout during partner call triggers graceful fallback
- **NFR14:** Missing `tandem:` configuration is silently ignored (backward compatible)

### Observability

- **NFR15:** Consultation token usage logged separately from leader tokens
- **NFR16:** Partner success/failure rate trackable per story
- **NFR17:** Consultation duration measurable for overhead analysis

