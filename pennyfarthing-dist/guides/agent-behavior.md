<critical>
**Session file:** `.session/{story-id}-session.md` - read `**Phase:**`, `**Workflow:**`, `**Repos:**`.

**Tests:** Use `testing-runner` subagent, never run directly.

**Handoff:** Run pf.sh `handoff resolve-gate` → gate check → pf.sh `handoff complete-phase` → pf.sh `handoff marker` → EXIT. See `<agent-exit-protocol>`.

**Sidecars:** Write learnings BEFORE starting exit protocol.

**Scripts:** Pennyfarthing scripts are Python-based (`pf/`), not shell—check before assuming `.sh`.

**pf CLI:** Never call bare `pf` — it is not globally installed. Always use the wrapper:
```bash
"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh <command> [args...]
```
</critical>

<critical>
**Story completion is MANDATORY.** A story is NOT done until:
1. Reviewer approves and merges the PR
2. SM runs pf.sh `sprint story finish` (archive session, update Jira, clean up)

**Never** start new work while stories have open PRs. The merge gate blocks `/pf-sprint work` if open PRs exist.

**If stuck in incomplete state:**
- Open PRs? → Run `/pf-reviewer` to complete reviews and merge
- Merged but not finished? → Run `/pf-sm` to trigger finish flow
</critical>

---

## Reference

<info>
**Workflow:** SM → TEA → Dev → Reviewer → SM. Trivial skips TEA.

**Skills:** `/pf-sprint`, `/pf-testing`, `/pf-jira`, `/pf-just`

**Efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Subagents:** Include skill paths in prompts - they don't auto-load.

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink issue).
</info>

---

<tandem-protocol>
## Tandem Backseat Observer

On activation, check session file for a `**Tandem:**` line (e.g., `**Tandem:** architect (file-watch)`).

**If no `**Tandem:**` line in session:** Skip entirely — no-op.

**If tandem is configured:**

1. **Resolve backseat persona** from theme using the `pf.sh theme`
   ```bash
   THEME=$(yq '.theme' .pennyfarthing/config.local.yaml)
   PARTNER_CHARACTER=$(yq ".agents.{PARTNER}.character" .pennyfarthing/personas/themes/${THEME}.yaml)
   ```

2. **Initialize observation file:**
   Create `.session/{STORY_ID}-tandem-{PARTNER}.md` with header:
   ```markdown
   # Tandem Observations: {STORY_ID}
   **Observer:** {PARTNER} ({PARTNER_CHARACTER})
   **Phase:** {PHASE}
   **Started:** {ISO_TIMESTAMP}

   ---
   ```

3. **Spawn backseat** (Task tool):
   ```yaml
   subagent_type: "general-purpose"
   model: "haiku"
   run_in_background: true
   prompt: |
     Read .pennyfarthing/agents/tandem-backseat.md for your instructions.

     PARTNER: "{PARTNER}"
     CHARACTER: "{PARTNER_CHARACTER}"
     STORY_ID: "{STORY_ID}"
     SCOPE: "{SCOPE}"
     OBSERVATION_FILE: ".session/{STORY_ID}-tandem-{PARTNER}.md"
     SESSION_FILE: ".session/{STORY_ID}-session.md"
   ```

4. **During work:** PostToolUse hook automatically detects new observations
   and injects them as `[Tandem] {CHARACTER}: {observation}`.
   When you receive a tandem injection, surface it naturally:
   *"{PARTNER_CHARACTER} suggests we extract this into an adapter."*

5. **Before handoff:** Terminate the backseat background task, then proceed
   with normal handoff sequence.

See `.pennyfarthing/guides/tandem-protocol.md` for full protocol details.
</tandem-protocol>

---

<team-mode>
## Team Mode — Phase-Scoped Native Teams

Team mode enables parallel agent collaboration within a single workflow phase using Claude Code's native Agent Teams. The phase agent is always the **team lead**; spawned agents are **teammates**. Teams are created at phase start and destroyed before handoff.

**Prerequisites:**
- Workflow phase has a `team:` block in its YAML definition
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var is set
- Interactive session (not `-p` mode)
- Feature detection passes (`pf detect teams` or equivalent)

**If prerequisites are not met:** Fall back to solo execution (optionally with tandem consultation). No error — team mode is always optional.

### Detection

On activation, check the workflow YAML for a `team:` block on your phase:

```yaml
phases:
  - name: green
    agent: dev
    team:
      teammates:
        - agent: architect
          task: "Review implementation approach and patterns"
        - agent: tea
          task: "Verify tests stay green, flag regressions"
```

If `team:` is present and prerequisites are met, you are the **team lead** for this phase.

### Team Lead Responsibilities

**On phase entry:**

1. **Create the team:**
   ```
   TeamCreate("phase-{PHASE}-{STORY_ID}")
   ```

2. **Spawn teammates** per workflow YAML config. Each teammate gets a spawn prompt:
   ```
   Task(team_name="phase-{PHASE}-{STORY_ID}", name="{agent}",
        prompt="Run `pf agent start {agent}`. Story: {STORY_ID}.
                {task assignment from YAML}")
   ```
   Teammates auto-load CLAUDE.md, MCP servers, and skills from the working directory. Spawn prompts only need the activation command and task assignment — keep under 500 tokens.

3. **Coordinate via SendMessage.** Use `SendMessage` for all intra-phase communication with teammates:
   - Assign work: `SendMessage(to="{teammate}", message="Implement the adapter pattern for...")`
   - Check status: `SendMessage(to="{teammate}", message="Status on your review?")`
   - Broadcast: `SendMessage(message="Shifting approach — using strategy pattern instead")`

4. **Do your own work.** You are still the primary implementer. Teammates assist — they don't replace you.

**Before exit protocol:**

5. **Shut down all teammates.** This is mandatory before starting the normal exit protocol:
   ```
   SendMessage(to="{teammate}", message="Phase complete. Shut down.")
   ```
   Wait for teammates to go idle, then:
   ```
   TeamDelete("phase-{PHASE}-{STORY_ID}")
   ```

6. **Proceed with normal exit protocol** (assessment → resolve-gate → complete-phase → marker).

### Teammate Responsibilities

When spawned as a teammate (you receive a task via spawn prompt, not a phase handoff):

1. **Recognize you are a teammate, not the lead.** You do not own the phase. You do not run the exit protocol. You do not emit handoff markers.

2. **Activate normally** via `pf agent start {agent}`. Read the session file for story context.

3. **Communicate via SendMessage.** All collaboration with the lead and other teammates uses `SendMessage`:
   - Report findings: `SendMessage(to="lead", message="Found coupling issue in...")`
   - Ask questions: `SendMessage(to="lead", message="Should I use the existing adapter?")`
   - Share status: `SendMessage(to="lead", message="Review complete. 2 issues found.")`

4. **Go idle when your task is done.** Once your assigned task is complete, send a final status message and wait. Do not start new work unprompted.

5. **Respond to shutdown requests.** When the lead sends a shutdown message, wrap up immediately. Save any observations to the session file or sidecar, then stop.

### Communication Channels

| Channel | Scope | Used For |
|---------|-------|----------|
| `SendMessage` | Intra-phase (within team) | Lead ↔ teammate collaboration, status updates, task assignment |
| Reflector markers (`<!-- CYCLIST:... -->`) | Inter-phase (between phases) | Handoff from one phase agent to the next — **unchanged** |
| Session file | Cross-phase persistence | Story state, assessments, ACs — written by lead only in team mode |
| Sidecar files | Agent learning | Teammates may write to their own sidecar with file locking |

<critical>
**Never use SendMessage for inter-phase handoff.** Markers and `pf handoff` are the only way to transition between phases. SendMessage is for real-time collaboration within a phase.

**Never use markers for intra-phase communication.** Markers are routing signals for Cyclist UI and the handoff system. They have no meaning inside a team.
</critical>
</team-mode>

---

## Reflector

<critical>
**Cyclist only:** EVERY TURN MUST END WITH A CYCLIST MARKER. Stop hook enforces this.
**CLI mode:** Do NOT emit CYCLIST markers — they are inert outside Cyclist.

| Situation | Cyclist Marker | CLI Behavior |
|-----------|---------------|--------------|
| Workflow handoff | `<!-- CYCLIST:HANDOFF:/agent -->` | Use AGENT_COMMAND `action` field |
| Handoff + context >80% | `<!-- CYCLIST:CONTEXT_CLEAR:/agent -->` | Tell user to `/clear` then run agent |
| Yes/no question | `<!-- CYCLIST:QUESTION:yesno -->` | Ask user directly |
| Open-ended question | `<!-- CYCLIST:QUESTION:open -->` | Ask user directly |
| Multiple choice | `<!-- CYCLIST:CHOICES:a,b,c -->` | Ask user directly |
| Everything else | `<!-- CYCLIST:CONTINUE -->` | (no marker needed) |
</critical>

---

<agent-exit-protocol>
## Exit Protocol

1. Write assessment to session
2. **If team mode active:** Shut down all teammates via `SendMessage`, then `TeamDelete`. Wait for cleanup before proceeding.
3. Terminate tandem backseat (if active)
4. `"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh handoff resolve-gate {story-id} {workflow} {phase}` → RESOLVE_RESULT
5. If blocked → report error, STOP
6. If skip → jump to step 8
7. If ready → spawn gate subagent with gate file → GATE_RESULT
   - If fail → fix issues, retry from step 4 (max 3 retries)
   - If pass → continue
8. `"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh handoff complete-phase {story-id} {workflow} {from} {to} {gate-type}`
9. `"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh handoff marker {next_agent}` → AGENT_COMMAND block
10. **Act on AGENT_COMMAND:**
    - Has `marker:` field → emit the CYCLIST marker (Cyclist path)
    - `action: "inline_handoff"` → run `activation_command` via Bash, output result, adopt new agent identity
    - `action: "tirepump_handoff"` → tell user: "Context is high. Run `/clear` then `{fallback}`"
    - No action, no marker → output `fallback` text and EXIT

**Agents drive exit directly — no handoff subagent.** Scripts handle routing and session updates atomically.
</agent-exit-protocol>

<wrong-phase-detection>
## Wrong Phase Detection

On activation, check if story phase belongs to you:

```bash
"$CLAUDE_PROJECT_DIR"/.pennyfarthing/scripts/core/pf.sh handoff phase-check {your_agent_name}
```

If result has `action: "redirect"`:

- **Cyclist:** Emit `<!-- CYCLIST:HANDOFF:/{phase_owner} -->` and EXIT
- **CLI + relay ON:** Run `source .pennyfarthing/scripts/lib/env.sh && source "$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/lib/run-pf.sh" && run_pf agent start {phase_owner} --tier handoff --quiet` via Bash, adopt new identity
- **CLI + relay OFF:** Output `Run /pf-{phase_owner} to continue` and EXIT
</wrong-phase-detection>
