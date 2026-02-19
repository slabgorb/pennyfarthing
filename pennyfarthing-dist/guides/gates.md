# Workflow Gates

<info>
Conditional checks that block or allow workflow phase transitions. Gates enforce quality thresholds — tests must pass, reviews must be approved, instructions must be unambiguous — before an agent can hand off to the next phase.
</info>

## Overview

Gates live in `pennyfarthing-dist/gates/` and are referenced by workflow YAML files via the `gate.file` field on phase definitions. When an agent finishes a phase, the handoff CLI resolves the gate, spawns a Haiku subagent to evaluate it, and blocks the transition if the gate fails.

## Built-in Gates

| Gate | File | Purpose | Used By |
|------|------|---------|---------|
| **tests-pass** | `gates/tests-pass.md` | Verify all tests pass, working tree clean, correct branch | Dev → Reviewer transitions |
| **tests-fail** | `gates/tests-fail.md` | Verify tests are RED (failing) with AC coverage | TEA → Dev transitions |
| **approval** | `gates/approval.md` | Verify reviewer has issued explicit APPROVED verdict | Reviewer → SM transitions |
| **confidence** | `gates/confidence.md` | Check if user instruction is ambiguous | Any agent entry gate |
| **dev-exit** | `gates/dev-exit.md` | Composite: tests-pass + no debug code | Dev → Reviewer transitions |
| **sm-setup-exit** | `gates/sm-setup-exit.md` | Session file, fields, context, branch created | SM → next agent transitions |
| **merge-ready** | `gates/merge-ready.md` | No open non-draft PRs | SM new work gate |
| **release-ready** | `gates/release-ready.md` | Composite: tests-pass + build, version, changelog | DevOps pre-deploy |
| **reviewer-preflight-check** | `gates/reviewer-preflight-check.md` | Composite: tests-pass + code smells, error boundaries | Reviewer preflight |

## Gate File Format

Gates use XML-style tags with `<pass>` and `<fail>` sections:

```xml
<gate name="tests-pass" model="haiku">

<purpose>
What this gate checks and why.
</purpose>

<pass>
Instructions for the gate subagent when checks succeed.
Must return a GATE_RESULT YAML block with status: pass.
</pass>

<fail>
Instructions for diagnosing failures.
Must return a GATE_RESULT YAML block with status: fail
and actionable recovery guidance.
</fail>

</gate>
```

## GATE_RESULT Contract

Gate subagents must return a structured YAML result:

```yaml
GATE_RESULT:
  status: pass | fail
  gate: gate-name
  message: "Human-readable summary"
  checks:
    - name: check-name
      status: pass | fail
      detail: "What was checked and the result"
  recovery:          # Only on fail
    - "Actionable step to fix the issue"
```

## Workflow Integration

Gates are declared in workflow YAML on phase transitions:

```yaml
phases:
  green:
    agent: dev
    gate:
      file: tests-pass     # References gates/tests-pass.md
    next: review
```

## Agent Exit Protocol

Agents interact with gates through the handoff CLI during their exit sequence:

```
1. Agent writes assessment to session file
2. pf.sh handoff resolve-gate {story-id} {workflow} {phase}
   → Reads workflow YAML, finds gate for current phase
   → Returns RESOLVE_RESULT: {status: ready|skip|blocked, gate_file: ...}
3. If ready → spawn Haiku subagent with gate file → GATE_RESULT
4. If GATE_RESULT.status == fail → fix issues, retry (max 3)
5. If GATE_RESULT.status == pass → continue to complete-phase
6. pf.sh handoff complete-phase {story-id} {workflow} {from} {to} {gate-type}
7. pf.sh handoff marker {next-agent}
```

If a phase has no `gate:` block, `resolve-gate` returns `status: skip` and the agent proceeds directly to `complete-phase`.

## Gate Evaluations

Extended evaluation criteria can live in `gates/evaluations/`:

| File | Purpose |
|------|---------|
| `evaluations/confidence-sm.md` | Historical evaluation of SM confidence gate (led to agent-agnostic `confidence` gate) |

## Creating Custom Gates

1. Create `pennyfarthing-dist/gates/my-gate.md` following the XML format above
2. Reference it in a workflow phase: `gate: { file: my-gate }`
3. The gate runner discovers files in the `gates/` directory by name

Gates run as Haiku subagents — keep instructions focused and evaluation criteria concrete.

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing-dist/gates/*.md` | Gate definitions |
| `pf/handoff/gate_runner.py` | Spawns gate subagents |
| `pf/handoff/gate_file.py` | Gate file discovery and resolution |
| `pf/handoff/resolve_gate.py` | Resolves gate for a workflow phase |

<info>
**ADR:** `docs/adr/0025-script-first-gate-extraction.md`
</info>
