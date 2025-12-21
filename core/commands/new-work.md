---
description: Start a new work session with BMAD
---

# Start New Work Session

**This is the blessed path for starting development work.**

---

## How It Works

`/new-work` invokes SM (Scrum Master) which uses the **subagent-first workflow**:

```
┌─────────────────────────────┐
│ 1. Status Check Subagent    │  ← Scans .session files + git status
│    (workflow-status-check)  │
└─────────────┬───────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
FINISH_STATE        NEW_WORK_STATE
    │                   │
    ▼                   ▼
SM handles         ┌───────────────┐
finish flow        │ 2. Research   │  ← Scans backlog, checks Jira
                   │ Subagent      │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ 3. SM presents│  ← User selects story
                   │ stories       │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ 4. File       │  ← Reads & summarizes files
                   │ Summary       │
                   │ Subagent      │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ 5. SM creates │  ← Technical context
                   │ story context │
                   └───────┬───────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ 6. Story      │  ← Jira, branches, session
                   │ Setup         │
                   │ Subagent      │
                   └───────────────┘
```

---

## Invoke SM

Simply activate SM to start the workflow:

```
/sm
```

SM will:
1. Run status check subagent to detect current state
2. If FINISH_STATE: Handle finish flow first
3. If NEW_WORK_STATE: Run research → present stories → file summary → create context → setup
4. Hand off to TEA (or Dev for trivial chores)

---

## Arguments

If you already know which story you want:

```
/sm start-story 32-8
```

This skips the research/selection phase and goes directly to file summary and context creation.

---

## Reference

- **SM Agent:** `.claude/agents/sm.md`
- **Status Check Subagent:** `.claude/subagents/workflow-status-check.md`
- **Research Subagent:** `.claude/subagents/sm-work-research.md`
- **File Summary Subagent:** `.claude/subagents/sm-file-summary.md`
- **Story Setup Subagent:** `.claude/subagents/sm-story-setup.md`
- **Workflow flow:** SM → TEA → Dev → Reviewer → SM (auto-finish)
