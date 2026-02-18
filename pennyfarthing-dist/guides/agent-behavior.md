<critical>
**Session file:** `.session/{story-id}-session.md` - read `**Phase:**`, `**Workflow:**`, `**Repos:**`.

**Tests:** Use `testing-runner` subagent, never run directly.

**Handoff:** Run pf.sh `handoff resolve-gate` → gate check → pf.sh `handoff complete-phase` → pf.sh `handoff marker` → EXIT. See `<agent-exit-protocol>`.

**Sidecars:** Write learnings BEFORE starting exit protocol.

**Scripts:** Pennyfarthing scripts are Python-based (`pennyfarthing_scripts/`), not shell—check before assuming `.sh`.

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
## Team Mode Protocol

When a workflow phase has a `team:` configuration block, the phase agent acts as
**team lead** and spawns teammates for parallel collaboration within that phase.

### Team Creation

On phase entry, detect the `team:` block in workflow YAML. Use `TeamCreate`
to create a phase-scoped team named after the phase (e.g., `"green-phase"`).

### Teammate Spawning

Spawn teammates via the Task tool with `team_name` parameter. Each teammate
runs `pf agent start {agent}` for full Prime activation. Keep spawn prompts
under 500 tokens — teammates auto-load CLAUDE.md, MCP servers, and skills.

### Communication

- **Inter-phase handoff:** Use Reflector markers (`<!-- CYCLIST:HANDOFF -->`)
  for phase transitions — unchanged from sequential mode.
- **Intra-phase collaboration:** Use `SendMessage` for real-time teammate
  communication. Never use markers for intra-phase messaging.

### Teammate Behavior

Teammates know they are NOT the lead. They:
- Communicate via SendMessage (DMs to lead or other teammates)
- Go idle when their assigned task is complete
- Respond to shutdown requests with shutdown_response

### Cleanup Before Handoff

Before starting the exit protocol, the lead MUST:
1. Send `shutdown_request` to all teammates via SendMessage
2. Wait for `shutdown_response` from each teammate
3. Run `TeamDelete` to clean up the team
4. Then proceed with normal handoff (resolve-gate → complete-phase → marker)

Teams are **phase-scoped** — created at phase start, destroyed at phase end.
Handoff between phases is unchanged.
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
2. Terminate tandem backseat (if active)
3. **If team is active:** Shut down all teammates → `TeamDelete` to clean up
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
