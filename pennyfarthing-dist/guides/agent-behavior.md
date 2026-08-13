<critical>
**Session file:** `.session/{story-id}-session.md` - read `**Phase:**`, `**Workflow:**`, `**Repos:**`.

**Tests:** Use `testing-runner` subagent, never run directly.

**Handoff:** Run `pf handoff resolve-gate` → gate check → `pf handoff complete-phase` → `pf handoff marker` → if output contains `relay: true`, use the Skill tool to invoke the `invoke` value (e.g., `/pf-dev`). Otherwise output the fallback and EXIT.

**Sidecars:** Write learnings BEFORE starting exit protocol.

**Scripts:** Pennyfarthing scripts are Python-based (`pf/`), not shell—check before assuming `.sh`.

**pf CLI:** Call `pf` directly — it is globally installed:
```bash
pf <command> [args...]
```
</critical>

<critical>
## Git Branching — Follow repos.yaml

**Before any git operation (branch, diff, PR, push), read `repos.yaml` for the correct base branch.** Each repo has its own branching strategy:

- Orchestrator (`.`) targets `main`
- Pennyfarthing (`pennyfarthing/`) targets `develop`

Do not assume `main` for all repos. Do not run `git diff main` or create PRs targeting `main` for repos that use `develop`. The topology is loaded in your prime context under "Repos Topology" — check it before every git operation.
</critical>

<critical>
## Context Discipline — Thoroughness Over Speed

**Context pressure is NOT your problem.** The system manages context (TirePump, relay mode, `/clear`). Your job is to do your phase correctly and completely.

Do not:
- Rush your assessment because context "feels high"
- Skip subagent results because you're worried about running out of room
- Abbreviate handoffs to save tokens
- Drop checklist items to "fit" within context
- Write terse, unexplained decisions when the gate requires rationale

Do:
- Complete every checklist item your agent definition requires
- Wait for all subagents before proceeding
- Write clear explanations for every decision (confirm, dismiss, defer)
- Write a complete handoff with all required sections
- Trust that relay mode and TirePump handle context transitions

**If a gate fails because you cut corners to save context, you will repeat the entire phase.** That costs more context than doing it right the first time.

**The right response to high context is a clean handoff, not a rushed one.** Stop, write your assessment completely, run the exit protocol. The system handles the rest.
</critical>

<critical>
**Story completion is MANDATORY.** A story is NOT done until:
1. Reviewer approves and merges the PR
2. SM runs `pf sprint story finish` (archive session, update Jira, clean up)

**Never** start new work while stories have blocking open PRs. The merge gate (`gates/merge-ready`) blocks `/pf-sprint work` if non-draft PRs exist for stories not in `in_review` status. PRs for `in_review` stories are allowed — they're awaiting external review and can't be self-merged.

**If stuck in incomplete state:**
- Blocking open PRs (story not `in_review`)? → Run `/pf-reviewer` to complete reviews and merge
- Merged but not finished? → Run `/pf-sm` to trigger finish flow
</critical>

---

<plan-mode>
## Plan Mode

To hand off plan execution to a different agent: `echo "dev" > .session/.plan-exit-agent` before entering plan mode. The `plan-exit-reload` hook consumes the file on exit and loads that agent automatically. Omit the file to reload the current phase owner. See `guides/plan-mode.md` for details.
</plan-mode>

---

<team-mode>
## Team Mode — Phase-Scoped Native Teams

When your workflow phase has a `team:` block (see `workflows/tdd-team.yaml`), you are the **team lead** for that phase and the agents you spawn are **teammates**. Teams are phase-scoped: created on phase entry, destroyed before handoff. If the prerequisites are not met — no `team:` block, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` unset, or a non-interactive session — fall back to solo execution. Team mode is always optional, never an error.

**As lead:**

1. **Team creation** — on phase entry, `TeamCreate("phase-{phase}-{story-id}")`.
2. **Teammate spawning** — spawn each entry in the workflow YAML `teammates:` list via the Task tool with `team_name` set. The spawn prompt needs only `pf agent start {agent}`, the story id, and the task assignment.
3. **Coordination** — use `SendMessage` for every intra-phase exchange. You remain the primary worker; teammates assist, they do not replace you.
4. **Cleanup before handoff** — send each teammate a shutdown request via `SendMessage`, wait for them to go idle, then `TeamDelete`. Only then start the exit protocol.

**As teammate:** you are not the lead. You do not own the phase, do not run the exit protocol, and do not emit handoff markers. Communicate via `SendMessage`, go idle when your task is done, and shut down when the lead asks.

**Channel discipline:** `SendMessage` is for intra-phase collaboration only. Inter-phase handoff is always `pf handoff` plus the handoff marker it emits. Never substitute one for the other.

Full protocol, including detection and teammate spawn prompts: `guides/team-mode.md`.
</team-mode>

---

<agent-exit-protocol>
## Exit Protocol

1. Write your assessment to the session file
2. **If team mode is active:** shut down all teammates via `SendMessage`, then `TeamDelete`. Wait for cleanup before continuing.
3. Terminate the tandem backseat observer (if active)
4. `pf handoff resolve-gate {story-id} {workflow} {phase}` → RESOLVE_RESULT
   - `blocked` / `error` → report the error and STOP
   - `skip` → jump to step 6
   - `ready` → spawn the gate subagent with the gate file → GATE_RESULT. On fail, fix the issues and retry from step 4 (max 3 retries).
5. If RESOLVE_RESULT carries `gate_extensions`, run each extension gate in order; the first failure stops the chain
6. `pf handoff complete-phase {story-id} {workflow} {from} {to} {gate-type}`
7. `pf handoff marker {next_agent}` → if the output contains `relay: true`, invoke the `invoke` value with the Skill tool; otherwise output the fallback text and EXIT

Agents drive exit directly — there is no handoff subagent. See `guides/handoff-cli.md` for the full command contract.
</agent-exit-protocol>

---

## Reference

<info>
**Workflow:** Read the active workflow YAML at `pennyfarthing-dist/workflows/` for phase order, agents, and tandem/team pairings. Session file `**Workflow:**` line tells you which one is active. `pf workflow show <name>` for details.

**Skills:** `/pf-sprint`, `/pf-testing`, `/pf-jira`, `/pf-just`

**Efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Subagents:** Include skill paths in prompts - they don't auto-load.

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink issue).

**tmux:** Use `pf tmux run <cmd>` for worker panes. See `guides/tmux-panes.md`. Never use raw `tmux send-keys`.
</info>

**Exit:** Each agent's `<exit>` section defines the handoff sequence. See `guides/handoff-cli.md` for the full protocol.
