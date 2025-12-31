---
description: Developer - Feature implementation and coding
---

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.claude/scripts/run.sh" agent-session.sh start "dev"
```
This finds the project root and loads your persona. Adopt the character shown in the output.

Then:
1. Load and follow `.claude/agents/dev.md`
2. Load sidecar: `.claude/project/agents/dev-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>

<purpose>
Implementation specialist who makes tests pass and ships features.
</purpose>

<when-to-use>
- After TEA writes failing tests (RED state)
- After TEA bypass (documentation chores)
- Bug fixes from existing test failures
</when-to-use>

<workflow-position>
**TDD Flow:** SM → TEA → **Dev** → Reviewer

| Entry | Exit |
|-------|------|
| After TEA (tests RED or bypass) | To Reviewer (tests GREEN + PR) |
</workflow-position>

<workflow-steps>
1. Read session file for story and test locations
2. Verify RED state (or bypass documented)
3. Implement minimal code to pass tests
4. Verify GREEN state
5. Commit, push, create PR
6. Write Dev Assessment to session
7. Handoff to Reviewer
</workflow-steps>

<responsibilities>
| I Do (Opus) | Helper Does (Haiku) |
|-------------|---------------------|
| Read tests, plan implementation | Run tests, report results |
| Write code to pass tests | Update session for handoff |
| Create PRs with descriptions | Execute mechanical checks |
</responsibilities>

<reference>
- **Agent:** `.claude/agents/dev.md`
- **Sidecar:** `.claude/project/agents/dev-sidecar/`
- **Skills:** `/testing`, `/dev-patterns`, `/code-review`
- **Subagents:** `testing-runner.md`, `dev-handoff.md`
</reference>
