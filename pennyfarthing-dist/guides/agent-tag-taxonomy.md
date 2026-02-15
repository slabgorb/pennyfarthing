# Agent Tag Taxonomy

This document defines the XML tag vocabulary for Pennyfarthing agent files. All content in agent files must be contained within tags (except the `# Header` line).

## Tag Categories

| Category | Purpose | Validation |
|----------|---------|------------|
| **Required** | Must exist in every primary agent | Error if missing |
| **Mindset** | Steers agent behavior against failure modes | Error if missing |
| **Structural** | Organizes agent content | Warning if missing when applicable |
| **Workflow** | Documents agent-specific workflows | No validation |
| **Subagent** | Used in subagent files | Error/Warning per tag |

---

## Required Tags (Primary Agents)

Every primary agent MUST have these tags:

| Tag | Purpose | Position |
|-----|---------|----------|
| `<role>` | One-line role description | Line 2-4 |
| `<helpers>` | Subagent table and model info | After mindset/critical |
| `<exit>` | Final exit instruction | Last tag in file |

### `<role>`
```xml
<role>
Feature implementation, making tests pass, code changes
</role>
```
- **Content:** Single line describing the agent's responsibility
- **Position:** Immediately after `# Header`

### `<helpers>`
```xml
<helpers>
**Model:** haiku | **Execution:** foreground (sequential)

| Subagent | Purpose |
|----------|---------|
| `testing-runner` | Run tests, gather results |
| `handoff` | Update session for handoff |
</helpers>
```
- **Content:** Model info, execution mode, subagent table
- **Paired with:** `<parameters>` (should follow immediately)

### `<exit>`
```xml
<exit>
Nothing after the marker. EXIT.
</exit>
```
- **Content:** Final instruction before agent exits
- **Position:** Must be the last tag in the file

---

## Mindset Tags (Primary Agents)

Each primary agent has ONE mindset tag that counters its natural failure mode.

| Agent | Tag | Counters |
|-------|-----|----------|
| SM | `<coordination-discipline>` | Scope creep into implementation |
| TEA | `<test-paranoia>` | Happy-path-only testing |
| Dev | `<minimalist-discipline>` | Over-engineering, gold-plating |
| Reviewer | `<adversarial-mindset>` | Rubber-stamping, approval bias |
| Orchestrator | `<systems-thinking>` | Symptom-fixing vs system-fixing |
| Architect | `<pragmatic-restraint>` | Premature abstraction, not reusing |
| PM | `<ruthless-prioritization>` | Feature bloat, scope creep |
| DevOps | `<automation-discipline>` | Manual processes, one-off fixes |
| Tech Writer | `<clarity-obsession>` | Unclear documentation |
| UX Designer | `<consistency-guardian>` | Introducing unnecessary patterns |

### Structure
```xml
<{mindset-tag}>
**You are not here to {default behavior}. You are here to {correct behavior}.**

{Context paragraph explaining the failure mode.}

**Default stance:** {One word}. {Question to ask self?}

- {Counter-example 1}
- {Counter-example 2}
- {Counter-example 3}

**{Closing maxim.}**
</{mindset-tag}>
```

### Position
- After `<role>`
- Before first `<critical>`

---

## Structural Tags

### `<critical>`
High-priority instruction that MUST be followed.

```xml
<critical>
**HANDOFF REQUIRES MARKER OUTPUT.** After exit protocol completes:
Run `handoff-marker.sh {next_agent}` as ABSOLUTE LAST ACTION, output result, EXIT.
</critical>
```
- **Validation:** First `<critical>` should be within line 30
- **Usage:** Multiple allowed per agent

### `<parameters>`
Documents what parameters to pass to each subagent.

```xml
<parameters>
## Subagent Parameters

### testing-runner
```yaml
REPOS: {repo name or "all"}
CONTEXT: "Verifying GREEN state for Story {STORY_ID}"
RUN_ID: "{STORY_ID}-dev-green"
```
</parameters>
```
- **Paired with:** `<helpers>` (should follow it)
- **Validation:** Warning if `<helpers>` exists without `<parameters>`

### `<arguments>` (Subagents Only)
Documents what parameters the subagent expects to receive.

```xml
<arguments>
| Argument | Required | Description |
|----------|----------|-------------|
| `REPOS` | Yes | Repository name(s) |
| `CONTEXT` | Yes | Why tests are being run |
</arguments>
```
- **Position:** Near top of subagent file, after frontmatter
- **Validation:** Warning if missing in subagent

### `<context>`
Files to load on activation.

```xml
<context>
**Load on activation:**
- `pennyfarthing-dist/sidecars/sm-patterns.md` (if exists)
- `pennyfarthing-dist/sidecars/sm-gotchas.md` (if exists)
</context>
```

### `<on-activation>`
Steps to execute when agent activates.

```xml
<on-activation>
1. Context already loaded by /prime
2. If handed off to Dev: "Story X-Y has tests ready. Shall I make them GREEN?"
</on-activation>
```
- **Validation:** Should be within line 100

### `<phase-check>`
Logic for checking if this agent owns the current phase.

```xml
<phase-check>
## On Startup: Check Phase

Read `**Workflow:**` and `**Phase:**` from session. Query:
```bash
OWNER=$(.pennyfarthing/scripts/workflow/phase-owner.sh {workflow} {phase})
```

**If OWNER != "dev":** Run `handoff-marker.sh $OWNER`, output result, tell user.
</phase-check>
```

### `<skills>`
Available slash commands for this agent.

```xml
<skills>
- `/pf-testing` - Test commands and patterns
</skills>
```

### `<handoffs>`
Documents handoff relationships with other agents.

```xml
<handoffs>
### From PM/SM
**When:** Epic or story needs architectural design
**Input:** Business requirements, technical constraints
**Action:** Design solution and provide guidance

### To Dev
**When:** Design is complete
**Output:** Architecture decision and implementation plan
</handoffs>
```

### `<delegation>`
Opus vs Haiku responsibility division.

```xml
<delegation>
## What I Do vs What Helper Does

| I Do (Opus) | Helper Does (Haiku) |
|-------------|------------------|
| Read tests, plan implementation | Run tests, report results |
| Write code to pass tests | Update session for handoff |
</delegation>
```

### `<reasoning-mode>`
Controls verbose/quiet reasoning output.

```xml
<reasoning-mode>
**Default:** Quiet mode - follow ReAct pattern internally, show only key decisions

**Toggle:** User says "verbose mode" to see explicit reasoning
</reasoning-mode>
```

---

## Gate Tags

Tags that contain checklists with `- [ ]` items.

| Tag | Purpose | Used By |
|-----|---------|---------|
| `<gate>` | General checklist gate | Subagents, SM |
| `<handoff-gate>` | Pre-handoff checklist | TEA, Dev, Reviewer |
| `<self-review>` | Self-review before handoff | Dev |
| `<review-checklist>` | Mandatory review steps | Reviewer |

```xml
<handoff-gate>
## MANDATORY: Complete Before Exiting

- [ ] Write Dev Assessment to session file
- [ ] Run `pf handoff resolve-gate` — verify gate status
- [ ] Run `pf handoff complete-phase` — atomic session update
- [ ] Run `handoff-marker.sh {next_agent}` — emit marker and EXIT
</handoff-gate>
```

---

## Workflow Tags

Agent-specific workflow documentation.

### Generic Workflow Tags

| Tag | Purpose |
|-----|---------|
| `<workflow>` | Single primary workflow |
| `<workflows>` | Multiple workflow sections |
| `<workflow-participation>` | Role in agent-docs workflow |

### SM-Specific Flow Tags

| Tag | Purpose |
|-----|---------|
| `<finish-flow>` | Story completion flow |
| `<new-work-flow>` | Starting new work flow |
| `<empty-backlog-flow>` | Empty backlog handling |
| `<workflow-routing>` | Workflow → agent routing table |

### Assessment Tags

| Tag | Purpose | Used By |
|-----|---------|---------|
| `<assessment-template>` | Single assessment format | TEA, Dev |
| `<assessment-templates>` | Multiple assessment formats | Reviewer |

### Exit Tags

| Tag | Purpose |
|-----|---------|
| `<exit-sequence>` | Detailed exit steps |
| `<exit>` | Final exit instruction (required) |

### Specialized Tags

| Tag | Purpose | Used By |
|-----|---------|---------|
| `<severity-levels>` | Review severity table | Reviewer |
| `<design-principles>` | UX design rules | UX Designer |
| `<coordination>` | Agent coordination table | Orchestrator |
| `<handoff-protocol>` | Handoff procedure | Tech Writer |

---

## Subagent Tags

### Required (Subagent Files)

| Tag | Purpose |
|-----|---------|
| `<arguments>` | Expected parameters table |
| `<output>` | Output format specification |

### Optional (Subagent Files)

| Tag | Purpose |
|-----|---------|
| `<gate>` | Execution checklist |
| `<critical>` | High-priority instruction |
| `<info>` | Informational note |

---

## Informational Tags

| Tag | Purpose |
|-----|---------|
| `<info>` | Non-critical information |
| `<output>` | Output format specification |

```xml
<info>
Universal entry point telling agents: what work exists, what phase, and whether to activate.
</info>
```

```xml
<output>
## Output Format

Return a `TEST_RESULT` block:

### Success (GREEN)
```
TEST_RESULT:
  status: success
  overall: GREEN
```
</output>
```

---

## File Structure Template

### Primary Agent
```
# {Name} Agent - {Title}
<role>...</role>

<{mindset-tag}>...</{mindset-tag}>

<critical>...</critical>

<helpers>...</helpers>

<parameters>...</parameters>

<context>...</context>

<phase-check>...</phase-check>

<on-activation>...</on-activation>

<delegation>...</delegation>

<workflow(s)>...</workflow(s)>

<gate>...</gate>

<assessment-template>...</assessment-template>

<exit-sequence>...</exit-sequence>

<handoffs>...</handoffs>

<skills>...</skills>

<exit>...</exit>
```

### Subagent
```
---
name: {subagent-name}
description: {one-line description}
tools: Bash, Read, Edit
model: haiku
---

<info>...</info>

<arguments>...</arguments>

<critical>...</critical>

<gate>...</gate>

{## Workflow steps}

<output>...</output>
```

---

## Validation Rules

The validator (`validate-agent-schema.sh`) enforces:

| Rule | Severity | Description |
|------|----------|-------------|
| Required tags present | Error | `<role>`, `<helpers>`, `<exit>` |
| Mindset tag present | Error | Agent-specific mindset tag |
| All content in tags | Error | No orphan content outside tags |
| XML tags balanced | Error | Every `<tag>` has `</tag>` |
| `<parameters>` with `<helpers>` | Warning | Should have both |
| `<arguments>` in subagents | Warning | Expected in all subagents |
| First `<critical>` position | Warning | Should be ≤ line 30 |
| `<on-activation>` position | Warning | Should be ≤ line 100 |
| File length | Error | Max 300 lines |
