# Handoff CLI

<info>
Python CLI for managing workflow phase transitions. Agents use `pf handoff` to resolve gates, complete phase transitions, and generate handoff markers during their exit protocol.
</info>

## Commands

### resolve-gate

Check whether the current phase has a gate and what state it's in.

```bash
pf handoff resolve-gate STORY_ID WORKFLOW PHASE
```

**Arguments:**
- `STORY_ID` — Story identifier (e.g., `105-1`)
- `WORKFLOW` — Workflow name (e.g., `tdd`, `trivial`, `patch`)
- `PHASE` — Current phase name (e.g., `green`, `implement`, `fix`)

**Output:** YAML `RESOLVE_RESULT` block:

```yaml
RESOLVE_RESULT:
  status: ready | skip | blocked
  gate_file: tests-pass       # Only when status=ready
  reason: "..."               # Human-readable explanation
```

| Status | Meaning |
|--------|---------|
| `ready` | Gate exists, subagent should evaluate it |
| `skip` | No gate defined for this phase, proceed directly |
| `blocked` | Phase cannot transition (exits with code 1) |

### complete-phase

Atomically update the session file to record a phase transition.

```bash
pf handoff complete-phase STORY_ID WORKFLOW FROM_PHASE TO_PHASE GATE_TYPE
```

**Arguments:**
- `STORY_ID` — Story identifier
- `WORKFLOW` — Workflow name
- `FROM_PHASE` — Phase being completed (e.g., `green`)
- `TO_PHASE` — Phase being entered (e.g., `review`)
- `GATE_TYPE` — Gate that was passed (e.g., `tests_pass`, `skip`, `none`)

**Output:** YAML `COMPLETE_RESULT` block:

```yaml
COMPLETE_RESULT:
  status: success | error
  from_phase: green
  to_phase: review
  gate_type: tests_pass
```

Updates the session file: `**Phase:**` line, timestamps, and phase history table.

### marker

Generate an environment-aware handoff marker block.

```bash
pf handoff marker NEXT_AGENT
pf handoff marker --error "Tests failing"
```

**Arguments:**
- `NEXT_AGENT` — Agent to hand off to (e.g., `dev`, `tea`, `reviewer`)

**Options:**
- `--error MSG` — Generate an error marker instead of a handoff

The marker generator checks relay mode and produces the appropriate output:

- **Relay OFF:** `AGENT_COMMAND` block with `relay_mode: false` and a fallback message for the user to invoke manually.
- **Relay ON:** `AGENT_COMMAND` block with `relay: true` and an `invoke` field. The agent uses the Skill tool to invoke the next agent automatically.

## Agent Exit Protocol

The handoff CLI is used in sequence during agent exit:

```
1. Write assessment to session file
2. pf handoff resolve-gate {story-id} {workflow} {phase}
   ├── blocked → report error, STOP
   ├── skip → jump to step 4
   └── ready → spawn gate subagent → GATE_RESULT
       ├── fail → fix issues, retry (max 3)
       └── pass → continue
3. pf handoff complete-phase {story-id} {workflow} {from} {to} {gate-type}
4. pf handoff marker {next-agent}
   ├── relay: true → invoke the `invoke` skill via Skill tool (next agent starts)
   └── relay: false → output fallback text → EXIT
```

See `guides/gates.md` for gate file format and evaluation details.

## Key Files

| File | Purpose |
|------|---------|
| `pf/handoff/cli.py` | Click command definitions |
| `pf/handoff/resolve_gate.py` | Gate resolution logic |
| `pf/handoff/complete_phase.py` | Session file atomic updates |
| `pf/handoff/marker.py` | Environment-aware marker generation |
| `pf/handoff/gate_runner.py` | Gate subagent spawner |
| `pf/handoff/gate_file.py` | Gate file discovery |

<info>
**Related:** `guides/gates.md` (gate system), `agents/agent-behavior.md` (exit protocol)
</info>
