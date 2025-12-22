---
description: Start a new work session with Pennyfarthing
---

# Start New Work Session

<purpose>
The blessed path for starting development work. Invokes SM to coordinate story selection and TDD flow setup.
</purpose>

<invoke>
```
/sm
```

Or with a specific story:
```
/sm start-story 32-8
```
</invoke>

<workflow-states>
| State | Action |
|-------|--------|
| MISSING_EPIC_CONTEXT | Prompt user to run `/start-epic` first |
| FINISH_STATE | SM handles finish flow (archive, Jira, cleanup) |
| NEW_WORK_STATE | Research → present stories → create context → setup |
</workflow-states>

<workflow-steps>
1. Status check subagent scans `.session/` and git
2. Research subagent scans backlog, checks Jira
3. SM presents stories, user selects
4. File summary subagent reads relevant files
5. SM creates technical context
6. Story setup subagent creates branches, session file
7. Handoff to TEA (or Dev for trivial 1-2 pt stories)
</workflow-steps>

<tdd-flow>
| Points | Route |
|--------|-------|
| 1-2 pts | SM → Dev (skip TEA) |
| 3-5 pts | SM → TEA → Dev → Reviewer |
| 8+ pts | SM → TEA → Dev → Reviewer |
</tdd-flow>

<reference>
- **SM Agent:** `.claude/agents/sm.md`
- **Subagents:** `workflow-status-check.md`, `sm-work-research.md`, `sm-file-summary.md`, `sm-story-setup.md`
</reference>
