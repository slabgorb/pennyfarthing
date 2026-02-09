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
2. Spawn `handoff` subagent → returns `HANDOFF_RESULT: {status, next_agent}`
3. If blocked → report error, stop
4. Run `.pennyfarthing/scripts/core/handoff-marker.sh {next_agent}`
5. Extract marker from YAML output, emit it:
   ```
   <!-- CYCLIST:HANDOFF:/dev -->

   Run `/dev` to continue
   ```
6. EXIT (nothing after marker)
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
