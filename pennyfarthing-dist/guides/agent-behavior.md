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

## Reference

<info>
**Workflow:** Read the active workflow YAML at `pennyfarthing-dist/workflows/` for phase order, agents, and tandem/team pairings. Session file `**Workflow:**` line tells you which one is active. `pf workflow show <name>` for details.

**Skills:** `/pf-sprint`, `/pf-testing`, `/pf-jira`, `/pf-just`

**Efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Subagents:** Include skill paths in prompts - they don't auto-load.

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink issue).
</info>

**Exit:** Each agent's `<exit>` section defines the handoff sequence. See `guides/handoff-cli.md` for the full protocol.
