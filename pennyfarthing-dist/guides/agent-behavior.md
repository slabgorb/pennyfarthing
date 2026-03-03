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
**Story completion is MANDATORY.** A story is NOT done until:
1. Reviewer approves and merges the PR
2. SM runs `pf sprint story finish` (archive session, update Jira, clean up)

**Never** start new work while stories have open PRs. The merge gate blocks `/pf-sprint work` if open PRs exist.

**If stuck in incomplete state:**
- Open PRs? → Run `/pf-reviewer` to complete reviews and merge
- Merged but not finished? → Run `/pf-sm` to trigger finish flow
</critical>

---

## Reference

<info>
**Workflow:** Read the active workflow YAML at `pennyfarthing-dist/workflows/` for phase order, agents, and tandem/team pairings. Session file `**Workflow:**` line tells you which one is active. `pf workflow show <name>` for details.

**Skills:** `/pf-sprint`, `/pf-testing`, `/pf-jira`, `/pf-just`

**Efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Subagents:** Include skill paths in prompts - they don't auto-load.

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink issue).
</info>

**Exit:** Each agent's `<exit>` section defines the handoff sequence. See `guides/handoff-cli.md` for the full protocol.
