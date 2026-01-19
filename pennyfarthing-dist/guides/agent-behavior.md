# Agent Behavior Guide

**For all Pennyfarthing agents.**

---

## Critical Protocols

<critical>
**Absolute paths:** `cd $CLAUDE_PROJECT_DIR && just test` - never relative `cd`.
Multi-repo: `cd $CLAUDE_PROJECT_DIR/$(get_repo_path "$repo")` after sourcing `scripts/repo-utils.sh`.
</critical>

<critical>
**Session file:** `.session/{story-id}-session.md` - extract `**Phase:**` (whose turn), `**Workflow:**` (tdd/trivial), `**Repos:**`, `**Feature Branch:**`.
</critical>

<critical>
**Handoff Action:** When `generic-handoff` returns `INVOKE_DIRECTLY`, invoke next agent immediately. Don't ask permission.
</critical>

<critical>
**Test delegation:** Never run tests directly. Always use `testing-runner` subagent.
</critical>

<critical>
**Sidecar memory:** Capture learnings BEFORE spawning handoff subagent. Don't wait until exit.
</critical>

---

## Reference

<info>
**Workflow:** SM → TEA → Dev → Reviewer → SM (finish). Trivial (1-2 pts) skips TEA.

**Confidence:** HIGH=proceed, MEDIUM=ask before risky, LOW=always ask.

**Skills:** `/sprint-context`, `/testing`, `/dev-patterns`, `/jira`, `/just`

**Cyclist markers:** `<!-- CYCLIST:HANDOFF:/tea -->`, `<!-- CYCLIST:QUESTION:yesno -->`, `<!-- CYCLIST:CHOICES:1,2,3 -->`

**Turn efficiency:** Parallelize reads, batch bash with `&&`, spawn independent subagents together.

**Background tasks:** Don't block unless result needed. Cyclist notifies on completion.

**Sidecar location:** `.pennyfarthing/sidecars/{agent}/` with `patterns.md`, `gotchas.md`, `decisions.md`.

**Subagent skills:** Include skill paths in prompts - subagents don't auto-load skills.

**Worktree:** Get path from session: `WORKTREE_PATH=$(grep "^path:" "$SESSION_FILE" | cut -d' ' -f2)`

**Dogfooding:** Write to `pennyfarthing-dist/` not `.claude/` (symlink permission issue).
</info>

---

## Project Context

<info>
**Project:** Pennyfarthing - Claude Code agent orchestration (pnpm monorepo, TypeScript)

**Key paths:**
- `pennyfarthing-dist/` - agents, commands, skills, guides, personas
- `sprint/current-sprint.yaml` - active sprint
- `.session/` - active work sessions

**Git:** Branch from `develop`, PR to `develop`, release merges to `main`.

**Commit:** `<type>(<scope>): <subject>` + `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`

**Build:** `npm run build`, `npm test`, `npm run lint`
</info>

---


## Persona System

<info>
**Config:** `.pennyfarthing/config.local.yaml` with `theme:` field.

**102 themes available:** `/list-themes` to browse, `/show-theme <name>` for details, `/set-theme <name>` to change.

**Categories:** TV Series, Film, Literature, Anime, Games, History/Mythology.

**Attributes:** `verbosity` (low/medium/high), `formality` (formal/casual/playful), `humor` (enabled/disabled/subtle).

**Per-agent override:**
```yaml
overrides:
  reviewer:
    theme: discworld  # Keep Granny even in Star Trek mode
```
</info>
