<critical>
**Session file:** `.session/{story-id}-session.md` - read `**Phase:**`, `**Workflow:**`, `**Repos:**`.

**Tests:** Use `testing-runner` subagent, never run directly.

**Handoff:** Run `handoff-marker.sh {next_agent}` → extract marker → emit → EXIT. See `<agent-exit-protocol>`.

**Sidecars:** Write learnings BEFORE spawning handoff subagent.

**Scripts:** Pennyfarthing scripts are Python-based (`pennyfarthing_scripts/`), not shell—check before assuming `.sh`.
</critical>

<critical>
**Story completion is MANDATORY.** A story is NOT done until:
1. Reviewer approves and merges the PR
2. SM runs `pf sprint story finish` (archive session, update Jira, clean up)

**Never** start new work while stories have open PRs. The merge gate blocks `/sprint work` if open PRs exist.

**If stuck in incomplete state:**
- Open PRs? → Run `/reviewer` to complete reviews and merge
- Merged but not finished? → Run `/sm` to trigger finish flow
</critical>

---

## Reference

<info>
**Workflow:** SM → TEA → Dev → Reviewer → SM. Trivial skips TEA.

**Skills:** `/sprint`, `/testing`, `/dev-patterns`, `/jira`, `/just`

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

1. **Resolve backseat persona** from theme:
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

## Reflector

<critical>
**EVERY TURN MUST END WITH A CYCLIST MARKER.** Stop hook enforces this.

| Situation | Marker |
|-----------|--------|
| Workflow handoff | `<!-- CYCLIST:HANDOFF:/agent -->` |
| Handoff + context >80% | `<!-- CYCLIST:CONTEXT_CLEAR:/agent -->` |
| Yes/no question | `<!-- CYCLIST:QUESTION:yesno -->` |
| Open-ended question | `<!-- CYCLIST:QUESTION:open -->` |
| Multiple choice | `<!-- CYCLIST:CHOICES:a,b,c -->` |
| Everything else | `<!-- CYCLIST:CONTINUE -->` |
</critical>

---

<agent-exit-protocol>
## Exit Protocol

1. Write assessment to session
2. Terminate tandem backseat (if active)
3. Spawn `handoff` subagent → returns `HANDOFF_RESULT: {status, next_agent}`
4. If blocked → report error, stop
5. Run `.pennyfarthing/scripts/core/handoff-marker.sh {next_agent}`
6. Extract marker from YAML output, emit it:
   ```
   <!-- CYCLIST:HANDOFF:/dev -->

   Run `/dev` to continue
   ```
7. EXIT (nothing after marker)
</agent-exit-protocol>

<wrong-phase-detection>
## Wrong Phase Detection

On activation, check if story phase belongs to you:

```bash
OWNER=$(.pennyfarthing/scripts/workflow/phase-owner.sh {workflow} {phase})
# If OWNER != your agent → emit handoff marker and EXIT
```

Output:
```
<!-- CYCLIST:HANDOFF:/{OWNER} -->

Run `/{OWNER}` to continue
```
</wrong-phase-detection>
