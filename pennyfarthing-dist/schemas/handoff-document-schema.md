# Handoff Document Schema

Handoff documents are the inter-agent communication contract for native subagent workflows. When an agent completes a phase, it writes a handoff document that the orchestrating agent (SM) reads and injects as context into the next agent's prompt.

## File Location

```
.session/{STORY_ID}-handoff-{PHASE}.md
```

**Examples:**
- `.session/143-5-handoff-red.md` (TEA completing red phase)
- `.session/143-5-handoff-implement.md` (Dev completing implement phase)
- `.session/143-5-handoff-review.md` (Reviewer completing review phase)
- `.session/143-5-handoff-verify.md` (TEA completing verify phase)

**Phase names must match the workflow YAML `name` field exactly.** Use `pf workflow show <name>` to see valid phase names per workflow.

## Schema

```xml
<handoff-document story="STORY_ID" from-phase="PHASE" to-phase="PHASE" agent="AGENT">

  <header>
    <story>{STORY_ID}</story>
    <agent>{agent role: sm|tea|dev|reviewer}</agent>
    <from-phase>{completing phase name}</from-phase>
    <to-phase>{next phase name}</to-phase>
    <timestamp>{ISO 8601 datetime}</timestamp>
    <workflow>{workflow name: tdd|trivial|bdd|tdd-tandem|bdd-tandem}</workflow>
    <verdict>{OPTIONAL: approved|rejected — reviewer only}</verdict>
  </header>

  <summary>
    What was done in this phase, 2-3 sentences. Focus on outcomes, not process.
  </summary>

  <deliverables>
    <file path="relative/path/to/file">{what changed}</file>
    <file path="relative/path/to/other">{what changed}</file>
    <!-- At least one deliverable required unless phase is setup -->
  </deliverables>

  <key-decisions>
    <decision>{what was decided}: {rationale in one sentence}</decision>
    <!-- Zero or more. Required if any design deviations occurred -->
  </key-decisions>

  <open-questions>
    <question>{anything the next agent should know or investigate}</question>
    <!-- Zero or more. Omit section if none -->
  </open-questions>

  <test-status>
    <passing>{count}</passing>
    <failing>{count}</failing>
    <skipped>{count}</skipped>
    <!-- Required for tea, dev, reviewer phases. Optional for sm -->
  </test-status>

</handoff-document>
```

## Markdown Rendering

The XML schema above defines the contract. Agents write handoff documents as **markdown** that maps 1:1 to this schema:

```markdown
# Handoff: {from-phase} -> {to-phase}
**Story:** {story_id}  |  **Agent:** {agent}  |  **Timestamp:** {ISO 8601}
**Workflow:** {workflow}

## Summary
{2-3 sentences on what was done}

## Deliverables
- `{path}`: {what changed}
- `{path}`: {what changed}

## Key Decisions
- {decision}: {rationale}

## Open Questions
- {question}

## Test Status
- Passing: {N}
- Failing: {N}
- Skipped: {N}
```

## Element Reference

### `<header>` — Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `story` | string | YES | Story ID (e.g., `143-5`) |
| `agent` | enum | YES | Agent role: `sm`, `tea`, `dev`, `reviewer` |
| `from-phase` | string | YES | Phase being completed. Must match workflow YAML phase name |
| `to-phase` | string | YES | Phase being transitioned to |
| `timestamp` | ISO 8601 | YES | When the handoff was written |
| `workflow` | string | YES | Active workflow name |
| `verdict` | enum | NO | `approved` or `rejected`. Only present on reviewer handoffs |

### `<summary>` — Required

2-3 sentences describing phase outcomes. Focus on what was achieved, not what steps were followed. The SM uses this to decide whether to proceed or escalate.

### `<deliverables>` — Conditionally Required

At least one `<file>` entry required for all phases except `setup`. Each entry identifies a changed file and what changed.

**SM consumption:** Used to inject file context into the next agent's prompt. Paths must be relative to repo root.

### `<key-decisions>` — Optional (Required if deviations exist)

Design decisions that deviate from the spec, ACs, or prior agent's expectations. Each entry is a decision with rationale. If the session file has entries in `## Design Deviations`, corresponding decisions MUST appear here.

**SM consumption:** Fed to the next agent so they understand why the prior agent diverged.

### `<open-questions>` — Optional

Unresolved questions, risks, or areas the next agent should investigate. Omit the section entirely if there are none — do not include an empty section.

**SM consumption:** Injected into the next agent's prompt as explicit investigation items.

### `<test-status>` — Conditionally Required

Required when the phase involves test execution (TEA red, TEA verify, Dev green, Reviewer preflight). Optional for SM setup phase.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `passing` | integer | YES | Number of passing tests |
| `failing` | integer | YES | Number of failing tests |
| `skipped` | integer | NO | Number of skipped tests. Omit if zero |

## Phase-Specific Contracts

### TEA (red phase → green)

```
from-phase: red
to-phase: green
```

- **Summary:** Must state how many tests were written and what they cover
- **Deliverables:** Test files only — no implementation files
- **Test Status:** `failing > 0` required (RED state). If all tests pass, the handoff is invalid
- **Key Decisions:** Test strategy choices (unit vs integration, mock boundaries)

### TEA (verify phase → review)

```
from-phase: verify
to-phase: review
```

- **Summary:** Must state verification result (tests still pass after refactor)
- **Test Status:** `failing == 0` required (GREEN state)

### Dev (green/implement phase → review or verify)

```
from-phase: green | implement
to-phase: review | verify
```

- **Summary:** Must state what was implemented and that tests pass
- **Deliverables:** Implementation files (source code, config)
- **Test Status:** `failing == 0` required (GREEN state)
- **Key Decisions:** Any deviations from TEA's test expectations

### Reviewer (review phase → finish or green/red)

```
from-phase: review
to-phase: finish | green | red
```

- **Summary:** Must state verdict (APPROVED/REJECTED) and top findings
- **Deliverables:** Reviewer Assessment in session file, finding counts
- **Test Status:** From preflight check
- **verdict:** Required in header. Determines `to-phase`: `approved` → `finish`, `rejected` → `green` or `red`

### SM (setup phase → red/implement/design)

```
from-phase: setup
to-phase: red | implement | design
```

- **Summary:** Story context and routing decision
- **Deliverables:** Session file, branch
- **Key Decisions:** Workflow selection rationale (if override applied)
- **Test Status:** Optional

## Workflow Phase Maps

### `tdd` / `tdd-tandem`
```
setup → red → green → review → finish
  SM     TEA    Dev   Reviewer   SM
```

Handoff chain: `handoff-setup.md` → `handoff-red.md` → `handoff-green.md` → `handoff-review.md`

### `trivial`
```
setup → implement → review → finish
  SM       Dev     Reviewer   SM
```

Handoff chain: `handoff-setup.md` → `handoff-implement.md` → `handoff-review.md`

### `bdd` / `bdd-tandem`
```
setup → design → red → green → review → finish
  SM      Dev     TEA    Dev   Reviewer   SM
```

Handoff chain: `handoff-setup.md` → `handoff-design.md` → `handoff-red.md` → `handoff-green.md` → `handoff-review.md`

## SM Consumption Protocol

The SM agent (story 143-7) reads handoff documents to chain phases:

1. **Read** the completed phase's handoff document from `.session/`
2. **Validate** required fields are present (header, summary, deliverables)
3. **Inject** the handoff content into the next agent's prompt as context
4. **Spawn** the next agent via `Agent` tool with the handoff as part of the prompt

**Injection format** (SM → next agent):

```markdown
## Prior Phase Context

The previous agent ({agent}) completed the {from-phase} phase:

{handoff document content}
```

**Validation failures** should produce a `GATE_RESULT` with `status: fail` and a message indicating which required field is missing. Do not proceed to the next phase if the handoff document is malformed.

## Lifecycle

1. Agent completes phase work
2. Agent writes assessment to session file
3. Agent writes handoff document to `.session/{story}-handoff-{phase}.md`
4. Agent runs exit protocol (`resolve-gate` → `complete-phase` → `marker`)
5. SM reads handoff document and injects into next agent's context
6. On story completion (`pf sprint story finish`), handoff documents are cleaned up with the session

## Relationship to Session File

Handoff documents are **complementary** to the session file, not a replacement:

| Concern | Session File | Handoff Document |
|---------|-------------|-----------------|
| Scope | Entire story lifecycle | Single phase transition |
| Audience | All agents, humans, tools | Next agent (via SM) |
| Mutability | Append-only (assessments, findings) | Write-once, read-once |
| Persistence | Archived on completion | Cleaned up on completion |
| Content | Assessments, findings, phase history | Deliverables, decisions, questions |

The session file remains the authoritative record. Handoff documents are ephemeral context bridges.
