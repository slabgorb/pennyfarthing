---
name: peloton
description: |
  Agent team mode for story workflows. SM initializes a peloton session, then
  advances agents (TEA, Dev, Reviewer) as teammates via TeamCreate. Separate
  replay mode benchmarks the pipeline against known scenarios.
args: "[start|next|status|stop]"
---

# /peloton - Agent Team Mode

Run a full agent team through a story workflow using Claude Code's native team mode.

## Concept

**Peloton** = the cycling term for the main group riding together. In Pennyfarthing,
it means the SM (team lead) spawns workflow agents as teammates who run within the
same Claude Code session. No tmux panes are created — agents coordinate through
team mode (`TeamCreate` / `SendMessage`).

## Two Modes

### Live Mode

SM initializes a peloton session for the active story, then advances agents one at
a time. Each `pf peloton next` call returns JSON with the team-mode data needed to
spawn the next agent as a teammate.

**Flow:**
1. SM runs `pf peloton start` (auto-detects story and workflow from session)
2. SM runs `pf peloton next` to get team-mode JSON for the first agent
3. SM calls `TeamCreate` with `team_name` and spawns an `Agent` with the returned `prompt`
4. Agent completes its phase, SM runs `pf peloton next` again for the next agent
5. Repeat until all agents have run
6. SM runs `pf peloton stop` to clear state

### Replay Mode

Benchmark the pipeline against a scenario with known ground truth findings.
Uses tmux panes (separate from live mode). See `guides/peloton.md` for methodology.

```bash
pf benchmark replay run scenarios/dpgd-116.yaml --theme dune --n 4
```

## CLI Reference

### Live Mode

| Command | Purpose |
|---------|---------|
| `pf peloton start` | Initialize session (reads story/workflow from session file) |
| `pf peloton start --story-id X-Y --workflow tdd` | Initialize with explicit values |
| `pf peloton next` | Output JSON for next agent's team-mode activation |
| `pf peloton status` | Show active session, agents, current role |
| `pf peloton status --json` | Machine-readable status |
| `pf peloton stop` | Clear peloton state |

### Replay Mode

| Command | Purpose |
|---------|---------|
| `pf benchmark replay run <scenario>` | Run pipeline against scenario |
| `pf benchmark replay score <dir> <scenario>` | Re-score an existing run |
| `pf benchmark replay compare <scenario>` | Compare results across themes |

## Team-Mode JSON (`pf peloton next` output)

```json
{
  "role": "tea",
  "team_name": "peloton-148-12",
  "prompt": "Run `pf agent start tea`. Story: 148-12.",
  "story_id": "148-12"
}
```

The caller (SM) uses these fields to:
1. `TeamCreate` with `team_name`
2. Spawn an `Agent` with `prompt` as the task
3. The agent activates via `pf agent start <role>` and picks up the story

## State

Peloton state is stored at `.pennyfarthing/peloton-state.json`:

```json
{
  "active": true,
  "story_id": "148-12",
  "workflow": "tdd",
  "agents": ["tea", "dev", "architect", "reviewer"],
  "active_role": "tea",
  "created_at": "2026-03-14T10:35:00Z"
}
```

SM is excluded from the agents list — SM is the team lead, not a teammate.

## Prerequisites

- **Live mode:** An active story session (`.session/*-session.md`)
- **Replay mode:** tmux server running (`pf frame start`), scenario YAML file

## Related

- `guides/peloton.md` — benchmark methodology and scoring
- `pf benchmark replay` — lower-level benchmark harness
